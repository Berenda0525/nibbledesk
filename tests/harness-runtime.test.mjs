import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,symlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHarnessRuntime} from '../desktop/harness-runtime.mjs';
import {relativeTaskPath,checkedTaskPath,childEnvironment,createWorkspaceTools,runWorkspaceNode} from '../core/task-policy.mjs';

const root=path.resolve('.test-data/harness');
async function fixture(){const dir=path.join(root,randomUUID());await mkdir(dir,{recursive:true});return dir;}
test('任务路径拒绝外部路径、ADS、设备名与链接',async()=>{
  for(const p of ['../outside','C:\\outside','a/../../b','file.txt:secret','aux.txt','a\\..\\b','file.'])assert.throws(()=>relativeTaskPath(p));
  const dir=await fixture(),outside=await fixture();await symlink(outside,path.join(dir,'link'),'junction');await assert.rejects(checkedTaskPath(dir,'link/secret'),/链接/);
  assert.equal(relativeTaskPath('src/test.js'),'src/test.js');
});
test('工具写入真实文件且覆盖需要读取版本、备份并拒绝未知工具',async()=>{
  const dir=await fixture();const execute=createWorkspaceTools({workspace:dir,historyDir:path.join(await fixture(),'history')});
  await execute('workspace_write',{path:'src/a.js',content:'const a = 1;'});await assert.rejects(execute('workspace_write',{path:'src/a.js',content:'changed'}),/expectedHash/);
  const old=await execute('workspace_read',{path:'src/a.js'});await execute('workspace_write',{path:'src/a.js',content:'const a = 2;',expectedHash:old.hash});
  assert.equal(await readFile(path.join(dir,'src/a.js'),'utf8'),'const a = 2;');await assert.rejects(execute('shell',{command:'whoami'}),/未启用/);
});
test('Node 执行不继承 API key 或用户环境，代码运行需要一次批准',async()=>{
  assert.deepEqual(childEnvironment('x',{SystemRoot:'C:\\Windows',API_KEY:'secret',GUAGUA_MODEL_KEY:'key',HOME:'private'}),{SystemRoot:'C:\\Windows',ELECTRON_RUN_AS_NODE:'1',NODE_NO_WARNINGS:'1',TEMP:'x',TMP:'x'});
  const dir=await fixture();await writeFile(path.join(dir,'a.mjs'),'console.log("ran")');
  await assert.rejects(runWorkspaceNode({workspace:dir,file:'a.mjs',mode:'run',requestApproval:async()=>false}),/未允许/);
  const result=await runWorkspaceNode({workspace:dir,file:'a.mjs',mode:'run',requestApproval:async request=>{assert.equal(request.cwd,dir);assert.match(request.command,/node --permission/);assert.equal(request.sourcePreview,'console.log("ran")');assert.equal(request.codeHash.length,64);assert.match(request.reason,/联网/);return true;}});assert.equal(result.exitCode,0);assert.match(result.stdout,/ran/);
});
test('实际 Node 权限拒绝工作区外读写和子进程',async()=>{
  const dir=await fixture(),outside=await fixture(),secret=path.join(outside,'secret');await writeFile(secret,'not-visible');
  await writeFile(path.join(dir,'test.mjs'),`import fs from 'node:fs';import cp from 'node:child_process';import assert from 'node:assert/strict';assert.throws(()=>fs.readFileSync(${JSON.stringify(secret)}),{code:'ERR_ACCESS_DENIED'});assert.throws(()=>fs.writeFileSync(${JSON.stringify(path.join(outside,'write'))},'x'),{code:'ERR_ACCESS_DENIED'});assert.throws(()=>cp.spawnSync(process.execPath,['-v']),{code:'ERR_ACCESS_DENIED'});console.log('permission verified');`);
  const result=await runWorkspaceNode({workspace:dir,file:'test.mjs',mode:'run',requestApproval:async()=>true});assert.equal(result.exitCode,0,result.stderr);assert.match(result.stdout,/permission verified/);
});
test('停止真实执行中的 Node 任务并等待退出',async()=>{
  const dir=await fixture();await writeFile(path.join(dir,'loop.mjs'),'setInterval(()=>{},1000)');const controller=new AbortController();
  const run=runWorkspaceNode({workspace:dir,file:'loop.mjs',mode:'run',requestApproval:async()=>true,signal:controller.signal});setTimeout(()=>controller.abort(new Error('stop-check')),250);await assert.rejects(run,/stop-check/);
});
test('Electron 内置 Node 能执行受限语法检查与真实测试',async()=>{
  const dir=await fixture();await writeFile(path.join(dir,'native.test.mjs'),'import test from "node:test";import assert from "node:assert/strict";test("native",()=>assert.equal(process.env.GUAGUA_MODEL_KEY,undefined));');
  const electron=createRequire(import.meta.url)('electron');
  const checked=await runWorkspaceNode({workspace:dir,file:'native.test.mjs',mode:'check',nodeExecutable:electron});assert.equal(checked.exitCode,0,checked.stderr);
  const tested=await runWorkspaceNode({workspace:dir,file:'native.test.mjs',mode:'test',nodeExecutable:electron,requestApproval:async()=>true});assert.equal(tested.exitCode,0,tested.stderr);
});
test('审批等待可停止，审批后源文件改变时拒绝执行',async()=>{
  const dir=await fixture();await writeFile(path.join(dir,'a.mjs'),'console.log("ok")');const controller=new AbortController();
  const run=runWorkspaceNode({workspace:dir,file:'a.mjs',mode:'run',signal:controller.signal,requestApproval:()=>new Promise(()=>{})});setTimeout(()=>controller.abort(Error('approval-stop')),60);await assert.rejects(run,/approval-stop/);
  await assert.rejects(runWorkspaceNode({workspace:dir,file:'a.mjs',mode:'run',requestApproval:async()=>{await writeFile(path.join(dir,'a.mjs'),'console.log("changed")');return true;}}),/审批后文件已变化/);
});

function sse(res,model,content,tools){
  res.writeHead(200,{'content-type':'text/event-stream'});const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'chatcmpl-test',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
  chunk({role:'assistant'});if(tools)chunk({tool_calls:tools.map(([name,args],i)=>({index:i,id:'call-'+randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}))});else chunk({content});chunk({},tools?'tool_calls':'stop');res.end('data: [DONE]\n\n');
}
test('真实 Harness 通过模拟模型写文件、运行测试、交付、恢复同聊天历史并隔离新聊天',{timeout:180000},async()=>{
  const dir=await fixture(),requests=[];let step=0;
  const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push(body);
    const script='import test from "node:test";import assert from "node:assert/strict";test("sum",()=>assert.equal(2+3,5));';
    const actions=[[['workspace_write',{path:'hello.test.mjs',content:script}]],[['run_node',{path:'hello.test.mjs',mode:'test'}]],[['deliver_file',{path:'hello.test.mjs'}]]];
    if(step<actions.length)sse(res,body.model,'',actions[step++]);else{sse(res,body.model,step++===3?'已实际保存并测试通过。':'续聊已完成。');}
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const runtime=createHarnessRuntime({dataDir:dir,nodeExecutable:path.resolve('resources/runtime/node.exe'),allowTestEndpoint:true,timeoutMs:50000});const events=[];const params={chatId:'one',agentId:'claude',provider:'apimart',model:'claude-test',apiKey:'local-test-key',baseURL:`http://127.0.0.1:${server.address().port}/v1`,prompt:'请生成并测试求和函数',requestApproval:async()=>true,onEvent:e=>events.push(e)};
  try{
    const first=await runtime.run(params);assert.equal(first.status,'completed');assert.equal(first.files.length,1);assert.equal(first.tests[0].exitCode,0,JSON.stringify(first.tests[0]));assert.match(first.text,/测试通过/);assert.equal(requests.length,4);assert.equal(requests[0].model,'claude-test');
    const second=await runtime.run({...params,prompt:'保留文件并说明之前做了什么'});assert.equal(second.sessionId,first.sessionId);assert.match(JSON.stringify(requests[4].messages),/请生成并测试求和函数/);
    const third=await runtime.run({...params,chatId:'two',prompt:'一个新聊天'});assert.notEqual(third.workspace,first.workspace);assert.doesNotMatch(JSON.stringify(requests[5].messages),/请生成并测试求和函数/);assert.ok(events.some(e=>e.type==='artifact'));
  }finally{await runtime.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('真实 Harness 模拟余额失败只请求一次、不生成交付文件',{timeout:90000},async()=>{
  let count=0;const server=createServer(async(req,res)=>{for await(const _ of req){}count++;res.writeHead(402,{'content-type':'application/json'}).end(JSON.stringify({error:{message:'test quota insufficient',type:'insufficient_quota'}}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const runtime=createHarnessRuntime({dataDir:await fixture(),allowTestEndpoint:true,timeoutMs:45000});const events=[];
  try{await assert.rejects(runtime.run({chatId:'quota',agentId:'claude',provider:'apimart',model:'claude-test',apiKey:'test-only',baseURL:`http://127.0.0.1:${server.address().port}/v1`,prompt:'请写程序',onEvent:e=>events.push(e)}),/quota|余额|402/);assert.equal(count,1);assert.equal(events.filter(e=>e.type==='artifact').length,0);}finally{await runtime.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('同一聊天并发任务拒绝，停止真实 Harness 后释放聊天槽位',{timeout:90000},async()=>{
  let reached;const ready=new Promise(resolve=>{reached=resolve;});const server=createServer(async(req,res)=>{for await(const _ of req){}reached();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const runtime=createHarnessRuntime({dataDir:await fixture(),allowTestEndpoint:true,timeoutMs:45000});const params={chatId:'busy',agentId:'gpt',provider:'apimart',model:'chat-test',apiKey:'test-only',baseURL:`http://127.0.0.1:${server.address().port}/v1`,prompt:'测试取消'};
  try{const running=runtime.run(params);const rejected=assert.rejects(running,/停止/);await assert.rejects(runtime.run(params),/已有开发任务/);await ready;runtime.cancel('busy');await rejected;const cancelled=new AbortController();cancelled.abort(Error('new-signal'));await assert.rejects(runtime.run({...params,signal:cancelled.signal}),/new-signal/);}finally{await runtime.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('最小 Harness 真实启动与应答不加载 node-pty',{timeout:90000},async()=>{
  const dir=await fixture(),cli=createRequire(import.meta.url).resolve('@deepseek-ai/dsh/lib/bin.js'),wrapper=path.join(dir,'native-guard.mjs'),report=path.join(dir,'native-loads.json');
  await writeFile(wrapper,`import {writeFileSync} from 'node:fs';const loads=[],original=process.dlopen;process.dlopen=function(...args){const file=String(args[1]);loads.push(file);if(/node-pty|conpty|winpty|[\\/]pty\.node/i.test(file))throw Error('node-pty must remain disabled');return original.apply(this,args);};process.on('exit',()=>writeFileSync(${JSON.stringify(report)},JSON.stringify(loads)));process.argv[1]=${JSON.stringify(cli)};const {runCli}=await import(${JSON.stringify(pathToFileURL(cli).href)});await runCli();`);
  const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;sse(res,JSON.parse(raw).model,'最小运行环境已就绪。');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const runtime=createHarnessRuntime({dataDir:dir,nodeExecutable:path.resolve('resources/runtime/node.exe'),cliPath:wrapper,allowTestEndpoint:true,timeoutMs:45000});
  try{const result=await runtime.run({chatId:'native-guard',agentId:'claude',provider:'apimart',model:'claude-test',apiKey:'test-only',baseURL:`http://127.0.0.1:${server.address().port}/v1`,prompt:'只回答运行环境就绪'});assert.match(result.text,/已就绪/);const loads=JSON.parse(await readFile(report,'utf8'));assert.ok(loads.every(file=>!/node-pty|conpty|winpty/i.test(file)));assert.ok(loads.some(file=>/node-addon-require-builtin/.test(file)));assert.ok(loads.every(file=>!file.includes(result.workspace+path.sep)));}finally{await runtime.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
