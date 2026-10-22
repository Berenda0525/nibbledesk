import {startHarnessProxy} from '../core/harness-proxy.mjs';
import {validProviderId} from '../core/provider-config.mjs';
import {normalizeUsage} from '../core/usage.mjs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,lstat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {taskIdentity,relativeTaskPath,checkedTaskPath,createWorkspaceTools,terminateOwnedProcess,childEnvironment,TASK_LIMITS} from '../core/task-policy.mjs';

const require=createRequire(import.meta.url);
const nativeModulePath=value=>value.replace(`${path.sep}app.asar${path.sep}`,`${path.sep}app.asar.unpacked${path.sep}`);
const pluginPath=nativeModulePath(fileURLToPath(new URL('./harness-tools-plugin.mjs',import.meta.url)));
const offRows=['sdk-jsonrpc-server','llm-deepseek','sandbox','sandbox-policy','subprocess','pty','terminal-bash','terminal-pwsh','persistent-bash','persistent-pwsh','mcp-resources','llm-retry'];
const taskPrompt=`你是瓜瓜的开发执行助手，使用当前用户选择的原模型。请用中文协作。只通过已提供工具读写当前聊天工作区，附件在 inputs 目录。先查看已有文件再修改。代码必须实际保存；测试必须通过 run_node 实际执行后才能报告成功。不要安装软件、修改权限、访问账号、猜测密钥或绕过审批。一次工具或模型失败不要通过重复付费请求掩盖失败。最终使用 deliver_file 提交真实成品并说明已验证与未验证项。HTML 使用自包含代码，外部依赖不可假设可用。你可写普通 JS、HTML、CSS、JSON、Markdown；当前执行器支持 JavaScript 语法检查和 node:test。`;
function profilePatch({provider,model,baseURL,api,full,workspace}){
  const config={providers:{[provider]:{api:api??(/^gpt|codex|^o[1-9]/i.test(model)?'openai-responses':'openai-completions'),baseURL,apiKeyEnv:'GUAGUA_MODEL_KEY',models:[{id:model,name:model,input:['text'],contextWindow:128000,maxTokens:8192}],retryPolicy:{mode:'normal',maxRetries:0},timeoutMs:120000,streamIdleTimeoutMs:90000}}};
  const disabled=full?['sdk-jsonrpc-server','llm-deepseek','llm-deepseek-account','mcp-resources','llm-retry','session-title-llm']:offRows;
  return [...disabled.map(id=>({id,disabled:true})),...(full?[{id:'agent-default-model',config:{provider,model}},{id:'approval',config:{policy:'ask'}},{id:'sandbox-policy',config:{mode:'danger-full-access',workspaceRoot:workspace}},{id:'llm-pi-ai',config}]:[]),{id:'system-prompt',config:{includeHarnessIdentity:false,includeRuntimeContext:full,personaPrefix:full?'你是瓜瓜的开发执行助手，使用当前选择的原模型与 Harness 完整 SDK。用中文沟通。原生文件、终端、任务、计划、压缩和子任务工具可以使用；操作需要审批时等待用户决定。文件只能依据实际工具结果报告成功，最终用 deliver_file 提交成品。':taskPrompt}},{insert:[...(!full?[{id:'guagua-provider',name:'@deepseek-ai/dsh-llm-pi-ai',config}]:[]),{id:'guagua-tools',name:pluginPath}]}];
}
function abortError(message='任务已停止'){return Object.assign(Error(message),{name:'AbortError'});}
export function createHarnessRuntime({dataDir,nodeExecutable,cliPath,requestApproval:defaultApproval,timeoutMs=600000,allowTestEndpoint=false}={}){
  if(!dataDir)throw Error('缺少任务数据目录');
  nodeExecutable??=process.resourcesPath&&existsSync(path.join(process.resourcesPath,'runtime','node.exe'))?path.join(process.resourcesPath,'runtime','node.exe'):fileURLToPath(new URL('../resources/runtime/node.exe',import.meta.url));
  if(!existsSync(nodeExecutable))throw Error('缺少已验证的 Node.js 任务运行组件，请重新安装完整桌面包');
  const active=new Map();let disposed=false;
  const workspace=chatId=>path.join(path.resolve(dataDir),'tasks',taskIdentity(chatId),'workspace');
  async function run(options){
    const {chatId,agentId,provider,model,apiKey,baseURL,prompt,attachments=[],signal,onEvent=()=>{},requestApproval=defaultApproval,api}=options;
    const chatKey=taskIdentity(chatId),agentKey=taskIdentity(agentId);
    if(disposed)throw Error('执行器已关闭');if(active.has(chatKey))throw Error('此聊天已有开发任务正在运行');
    if(!validProviderId(provider)||typeof model!=='string'||!model.trim()||model.length>160||typeof apiKey!=='string'||!apiKey||typeof prompt!=='string'||!prompt.trim()||prompt.length>60000)throw Error('开发任务配置无效');
    const endpoint=new URL(baseURL);if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!(endpoint.protocol==='https:'||endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))throw Error('模型服务地址未获允许');
    if(!Array.isArray(attachments)||attachments.length>20)throw Error('附件数量超过限制');
    signal?.throwIfAborted();const controller=new AbortController();const abort=()=>controller.abort(signal.reason??abortError());signal?.addEventListener('abort',abort,{once:true});
    const job={controller,child:null};active.set(chatKey,job);
    const taskRoot=path.join(path.resolve(dataDir),'tasks',chatKey),cwd=workspace(chatId),home=path.join(taskRoot,'harness',agentKey),sessionId='guagua-'+chatKey+'-'+agentKey,metaPath=path.join(home,'session-state.json');
    const clean=value=>typeof value==='string'?value.replaceAll(apiKey,'[hidden]'):value;
    const emit=event=>{try{onEvent(JSON.parse(clean(JSON.stringify({...event,chatId,agentId}))));}catch{}};
    let timer,server,proxy,closed=false,stderr='',failure,sessionExists=false,expectedExit=false,stateWrite=Promise.resolve();const files=[],toolCalls=[],tests=[],usageEvents=new Set();let text='',usage=null,capabilities=[];const full=options.harnessProfile==='sdk';
    try{
      await mkdir(cwd,{recursive:true});await mkdir(home,{recursive:true});await mkdir(path.join(home,'temp'),{recursive:true});await checkedTaskPath(cwd,'.',{allowRoot:true});
      const prepared=[];
      for(let i=0;i<attachments.length;i++){
        const item=attachments[i];if(!item||typeof item.path!=='string')throw Error('附件缺少本地路径');const stat=await lstat(item.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>TASK_LIMITS.fileBytes)throw Error('附件过大或路径无效');
        const name=path.basename(item.name??item.path).replace(/[^\p{L}\p{N}._-]/gu,'_').slice(0,100)||'attachment';const relative='inputs/'+randomUUID().slice(0,8)+'-'+name;relativeTaskPath(relative);const dest=await checkedTaskPath(cwd,relative,{createParents:true});await copyFile(item.path,dest);prepared.push(relative);
      }
      try{const old=JSON.parse(await readFile(metaPath,'utf8'));sessionExists=old.sessionId===sessionId;}catch(error){if(error.code!=='ENOENT')throw error;}
      proxy=await startHarnessProxy({getState:async()=>({models:[{provider,id:model,kind:'chat'}]}),keys:{get:async id=>id===provider?apiKey:null},definitions:()=>({[provider]:{baseUrl:baseURL}})});
      const patchFile=path.join(home,'guagua.patch.json');await writeFile(patchFile,JSON.stringify(profilePatch({provider,model,baseURL:proxy.origin+'/proxy/'+provider,api,full,workspace:cwd})));
      const token=randomBytes(32).toString('hex');
      const execute=createWorkspaceTools({workspace:cwd,historyDir:path.join(taskRoot,'history'),nodeExecutable,signal:controller.signal,requestApproval:async request=>{const payload={...request,id:randomUUID(),chatId,agentId};const {signal:_,...visible}=payload;emit({type:'approval',...visible});return await requestApproval?.(payload);},onEvent:emit,onArtifact:artifact=>{const index=files.findIndex(file=>file.path===artifact.path);if(index<0)files.push(artifact);else files[index]=artifact;emit({type:'artifact',artifact});}});
      server=createServer(async(req,res)=>{
        if(req.method!=='POST'||req.url!=='/tools'||req.headers.authorization!=='Bearer '+token){res.writeHead(403).end();return;}
        try{
          let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>TASK_LIMITS.textBytes+8192)throw Error('工具请求过大');}
          const {name,args}=JSON.parse(raw);if(toolCalls.length>=60)throw Error('本次工具调用已达 60 次上限');controller.signal.throwIfAborted();
          if(name==='native_approval'){const approved=await requestApproval?.({type:'execute',tool:args.name,cwd,command:args.name+' '+JSON.stringify(args.arguments).slice(0,3500),reason:'Harness 原生工具请求：请检查操作参数；终端命令可能访问本机文件和网络。',sourcePreview:JSON.stringify(args.arguments,null,2).slice(0,16000),signal:controller.signal});controller.signal.throwIfAborted();res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({result:{approved:approved===true}}));return;}
          const call={id:randomUUID(),name,args};toolCalls.push(call);emit({type:'tool_call',...call});const result=await execute(name,args);if(name==='run_node')tests.push(result);emit({type:'tool_result',id:call.id,name,result});res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({result}));
        }catch(error){emit({type:'tool_result',error:clean(error.message)});res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:clean(error.message)}));}
      });
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      controller.signal.throwIfAborted();
      const binary=cliPath??nativeModulePath(require.resolve('@deepseek-ai/dsh/lib/bin.js'));
      const env={...childEnvironment(path.join(home,'temp')),PATH:process.env.PATH,DSH_HOME:home,DSH_TELEMETRY_MODE:'DISABLED',DSH_TELEMETRY_DISABLED:'1',GUAGUA_MODEL_KEY:proxy.token,GUAGUA_HARNESS_PROFILE:full?'sdk':'sdk-minimal',GUAGUA_TOOL_ENDPOINT:`http://127.0.0.1:${server.address().port}/tools`,GUAGUA_TOOL_TOKEN:token,GUAGUA_RESUME_SESSION:sessionExists?sessionId:'',DSH_PRIMARY_RUNTIME:''};
      const child=spawn(nodeExecutable,[binary,'--profile',full?'sdk':'sdk-minimal','--patch',patchFile],{cwd,env,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});job.child=child;
      const pending=new Map();let nextId=1,buffer='',running=false,stepCount=0,resolveDone,rejectDone;const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
      const request=(method,params)=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,...params===undefined?{}:{params}})+'\n');});
      const fail=error=>{failure??=error;for(const value of pending.values())value.reject(error);pending.clear();rejectDone(error);};
      const stop=()=>{const error=controller.signal.reason??abortError();fail(error);void terminateOwnedProcess(child);};controller.signal.addEventListener('abort',stop,{once:true});
      timer=setTimeout(()=>controller.abort(abortError('开发任务超时，已停止')),timeoutMs);
      child.stderr.on('data',chunk=>{stderr=(stderr+clean(chunk.toString())).slice(-16000);});
      child.on('error',fail);child.stdin.on('error',fail);
      const exit=new Promise(resolve=>child.once('close',(code)=>{closed=true;controller.signal.removeEventListener('abort',stop);if((code!==0||!expectedExit)&&!failure)fail(Error('Harness 进程提前退出：'+code+' '+stderr.slice(-1500)));resolve(code);}));
      child.stdout.on('data',chunk=>{
        buffer+=chunk.toString();if(buffer.length>8*1024*1024){controller.abort(Error('Harness 事件超出限制'));return;}
        let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;let msg;try{msg=JSON.parse(line);}catch{controller.abort(Error('Harness 协议格式错误'));return;}
          if(msg.id!==undefined){const wait=pending.get(msg.id);if(wait){pending.delete(msg.id);msg.error?wait.reject(Error(clean(msg.error.message))):wait.resolve(msg.result);}continue;}
          if(msg.method==='guagua.capabilities'){capabilities=msg.params.tools;emit({type:'capabilities',tools:capabilities,profile:msg.params.profile});}
          if(msg.method==='guagua.session'){sessionExists=true;stateWrite=stateWrite.then(()=>writeFile(metaPath,JSON.stringify({sessionId,provider,model})));stateWrite.catch(error=>controller.abort(error));}
          if(msg.method==='session.status'&&msg.params.sessionId===sessionId){if(msg.params.status==='running')running=true;emit({type:'status',status:msg.params.status});if(running&&msg.params.status==='idle')resolveDone();}
          if(msg.method==='session.event'&&msg.params.sessionId===sessionId){
            const event=msg.params.event;emit({type:'harness_event',event});if(full&&/^(tool\/|subagent\/|job\/|compaction\/|todo\/|plan\/)/.test(event.type))emit({type:event.type,tool:event.data?.name??event.data?.toolName,text:JSON.stringify(event.data).slice(0,12000)});
            if(event.type==='assistant/message'){
              const count=normalizeUsage(event.data.usage),identity=event.seq??`${event.data.turn}:${event.data.step}`;
              if(count&&!usageEvents.has(identity)){usageEvents.add(identity);usage??={input_tokens:0,output_tokens:0,total_tokens:0};usage.input_tokens+=count.input;usage.output_tokens+=count.output;usage.total_tokens+=count.total;}
            }
            if(event.type==='step/start'&&++stepCount>(full?40:20)){controller.abort(Error('本次开发步骤达到 20 次上限，请查看现有成果后继续'));return;}
            if(event.type==='assistant/message'){const blocks=event.data.content??event.data.message?.content??[];const part=blocks.filter(b=>b.type==='text').map(b=>b.text).join('');if(part){text+=part;emit({type:'text',text:part});}}
            if(event.type==='turn/end'&&event.data.reason?.kind!=='completed')failure=Error(clean(event.data.reason?.error?.message??'任务未完成：'+event.data.reason?.kind));
          }
        }
      });
      emit({type:'status',status:'starting',workspace:cwd,sessionId});
      await request('initialize',{cwd,provider,model,maxTokens:8192});
      const content=prompt+(prepared.length?'\n\n本轮附件已放入工作区：\n'+prepared.join('\n'):'');
      await request('session/prompt',{sessionId,contentBlocks:[{type:'text',text:content}]});await done;
      expectedExit=true;await request('shutdown');await exit;await stateWrite;controller.signal.throwIfAborted();if(failure)throw failure;
      return {text,sessionId,workspace:cwd,files,toolCalls,tests,usage,capabilities,status:'completed'};
    }catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw Error(clean(error.message)+(full&&stderr?' '+stderr.slice(-2500):''));}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(job.child&&!closed)await terminateOwnedProcess(job.child);if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await proxy?.close();if(active.get(chatKey)===job)active.delete(chatKey);}
  }
  return {run,workspace,cancel(chatId){active.get(taskIdentity(chatId))?.controller.abort(abortError());},async dispose(){disposed=true;await Promise.all([...active.values()].map(async job=>{job.controller.abort(abortError());await terminateOwnedProcess(job.child);}));}};
}
