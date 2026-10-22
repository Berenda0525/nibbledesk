import {HarnessSdkJsonRpcServer} from '@deepseek-ai/dsh-sdk-jsonrpc-server';
import {JsonRpcLineTransport} from '@deepseek-ai/dsh-sdk-protocol';

export const name='guagua-workspace-tools';
export const inject=['agents','tools','sdkAppStartup','loader'];
const text={type:'string'};
const definitions=[
  ['workspace_list','列出当前聊天工作区中的文件。仅使用相对路径。',{path:text},[]],
  ['workspace_read','读取工作区文本文件，返回内容和 hash。',{path:text},['path']],
  ['workspace_write','新建或覆盖工作区文件。新文件可省略 expectedHash，覆盖现有文件必须使用刚读取的 hash。',{path:text,content:text,expectedHash:text},['path','content']],
  ['workspace_edit','修改工作区文本中的一处精确原文；oldText 必须恰好出现一次。',{path:text,oldText:text,newText:text},['path','oldText','newText']],
  ['run_node','验证或运行 JavaScript：check 语法检查；test 运行 node:test；run 执行脚本。test/run 需要用户批准。不能安装依赖、启动子进程或读取工作区外文件。HTML 可交付用户预览，不要声称已做浏览器视觉测试。',{path:text,mode:{type:'string',enum:['check','test','run']}},['path','mode']],
  ['deliver_file','将工作区内实际存在的成品文件加入本次聊天交付，必须对每个希望用户收到的文件调用一次。',{path:text},['path']]
];
export function apply(ctx){
  const transport=new JsonRpcLineTransport(process.stdin,process.stdout);
  const full=process.env.GUAGUA_HARNESS_PROFILE==='sdk',grants=new Map();
  const host=async(name,args,signal)=>{const response=await fetch(process.env.GUAGUA_TOOL_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+process.env.GUAGUA_TOOL_TOKEN},body:JSON.stringify({name,args}),signal});const body=await response.json();if(!response.ok)throw Error(body.error||'工具请求失败');return body.result;};
  if(full){
    ctx.on('tools/pre-execute',async(exec,next)=>{
      if(definitions.some(([name])=>name===exec.name))return next();
      const result=await host('native_approval',{name:exec.name,arguments:exec.arguments},exec.signal);
      if(!result.approved)return {kind:'deny',reason:'用户拒绝了此次操作'};
      grants.set(exec.callId,true);return next();
    });
    ctx.on('tools/result',exec=>{grants.delete(exec.callId);});
    ctx.on('approval/request',async request=>{
      if(grants.get(request.callId))return 'allowed-once';
      const result=await host('native_approval',{name:request.toolName,arguments:{reason:request.reason}},request.signal);
      return result.approved?'allowed-once':'rejected';
    });
  }
  class ResumableServer extends HarnessSdkJsonRpcServer{
    async createSession(sessionId){
      let record;
      if(process.env.GUAGUA_RESUME_SESSION===sessionId){
        record={handle:await this.ctx.agents.resume({resumeSessionId:sessionId,agentOptions:{provider:this.provider,model:this.model,maxTokens:this.maxTokens}})};
        this.sessions.set(sessionId,record);
      }else record=await super.createSession(sessionId);
      if(!full)record.handle.agent.ctx.tools.restrict({allow:definitions.map(([tool])=>tool)});
      transport.notify('guagua.capabilities',{profile:full?'sdk':'sdk-minimal',tools:record.handle.agent.ctx.tools.schemas().map(t=>({name:t.name,description:t.description}))});
      transport.notify('guagua.session',{sessionId});return record;
    }
  }
  const server=new ResumableServer(ctx,transport,{maxTokensAsSuccess:false});
  for(const [tool,description,properties,required] of definitions)ctx.tools.register({
    name:tool,description,parameters:{type:'object',properties,required,additionalProperties:false},
    output:{schema:{type:'object',properties:{},additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    async execute(args,exec){
      const response=await fetch(process.env.GUAGUA_TOOL_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+process.env.GUAGUA_TOOL_TOKEN},body:JSON.stringify({name:tool,args}),signal:exec.signal});
      const body=await response.json();if(!response.ok)throw Error(body.error??'工具执行失败');return body.result;
    }
  });
  transport.onRequest(async(method,params)=>{
    if(method==='initialize')await ctx.get('loader')?.await();
    const result=await server.handleRequest(method,params);
    if(method==='shutdown')setImmediate(async()=>{await transport.flush();await ctx.root.fiber.dispose();process.exit(0);});
    return result;
  });
  ctx.effect(()=>{transport.start();return async()=>{await server.shutdown();transport.close();};},'guagua.sdk');
}
