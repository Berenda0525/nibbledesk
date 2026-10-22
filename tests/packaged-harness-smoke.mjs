import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,access,writeFile,realpath,lstat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {artifactPaths} from '../scripts/artifact-paths.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(await readFile(path.join(project,'package.json'),'utf8')).version,artifacts=artifactPaths(version);
const packed=path.resolve(process.argv[3]??artifacts.qa);
const dataDir=path.resolve(process.argv[4]??path.join(artifacts.evidence,'packaged-harness',randomUUID()));
const fixture=path.resolve(process.argv[5]??path.join(project,'.test-data/speech-fixtures/jfk.wav'));
const executable=path.join(packed,'瓜瓜.exe');

async function verifyIsolatedApplicationDirectory(){
  const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
  const within=(base,target)=>{const relative=path.relative(normalize(base),normalize(target));return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
  if(within(project,packed))throw Error('被测应用必须位于本项目目录之外。请先使用 npm run qa:prepare，默认验收位置为 '+artifacts.qa+'；项目内发行目录可能借用上级 node_modules。');
  const [canonicalProject,canonicalPacked]=await Promise.all([realpath(project),realpath(packed)]);
  if(within(canonicalProject,canonicalPacked))throw Error('被测目录解析后仍位于本项目内，请选择项目树外的真实安装目录。');
  for(const start of new Set([path.dirname(packed),path.dirname(canonicalPacked)])){
    let ancestor=start;
    while(true){
      const modules=path.join(ancestor,'node_modules');
      try{await lstat(modules);throw Error('被测应用的上级目录存在 node_modules，可能掩盖缺失依赖：'+modules+'。请改用上级目录不含 node_modules 的独立安装位置。');}catch(error){if(error.code!=='ENOENT')throw error;}
      const next=path.dirname(ancestor);if(next===ancestor)break;ancestor=next;
    }
  }
}
await verifyIsolatedApplicationDirectory();

if(process.argv[2]!=='--packaged-child'){
  await Promise.all([access(executable),access(path.join(packed,'resources/app.asar')),access(fixture)]);
  await mkdir(dataDir,{recursive:true});
  const env={ELECTRON_RUN_AS_NODE:'1',NODE_NO_WARNINGS:'1',TEMP:dataDir,TMP:dataDir};
  for(const key of ['SystemRoot','WINDIR','ComSpec','PATHEXT'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(executable,[fileURLToPath(import.meta.url),'--packaged-child',packed,dataDir,fixture],{env,cwd:dataDir,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',c=>{stdout+=c;process.stdout.write(c);});child.stderr.on('data',c=>{stderr+=c;process.stderr.write(c);});
  const timer=setTimeout(()=>{if(process.platform==='win32'&&child.pid){const stop=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.on('error',()=>child.kill());}else child.kill();},330000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);
  await writeFile(path.join(dataDir,'packaged-smoke-result.json'),JSON.stringify({code,stdout,stderr,packed,fixture,createdAt:new Date().toISOString()},null,2));
  if(code!==0)throw Error('安装包运行环境验证失败：'+code);
}else{
  const resources=path.join(packed,'resources'),asar=path.join(resources,'app.asar');
  for(const relative of ['desktop/harness-runtime.mjs','desktop/harness-tools-plugin.mjs','core/task-policy.mjs'])assert.deepEqual(await readFile(path.join(asar,relative)),await readFile(path.join(project,relative)),`安装包应包含最新 ${relative}`);
  const runtimeUrl=pathToFileURL(path.join(asar,'desktop/harness-runtime.mjs')).href;
  const requirePacked=createRequire(runtimeUrl),cliPath=requirePacked.resolve('@deepseek-ai/dsh/lib/bin.js');
  assert.ok(cliPath.startsWith(asar+path.sep),'Harness 必须从安装包内部解析');
  const {createHarnessRuntime}=await import(runtimeUrl);
  const {createSpeechEngine}=await import(pathToFileURL(path.join(asar,'desktop/speech.mjs')).href);
  let step=0;const requests=[],events=[],approvals=[];
  const server=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push(body);
    res.writeHead(200,{'content-type':'text/event-stream'});
    const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'packaged-smoke',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
    const source='import test from "node:test";import assert from "node:assert/strict";test("packaged runtime",()=>{assert.equal(2+3,5);assert.equal(process.env.GUAGUA_MODEL_KEY,undefined);});';
    const actions=[['workspace_write',{path:'packaged.test.mjs',content:source}],['run_node',{path:'packaged.test.mjs',mode:'test'}],['deliver_file',{path:'packaged.test.mjs'}]];
    chunk({role:'assistant'});
    if(step<actions.length){const [name,args]=actions[step++];chunk({tool_calls:[{index:0,id:'call-'+randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});chunk({},'tool_calls');}
    else{chunk({content:'安装包内的执行测试已完成。'});chunk({},'stop');step++;}
    res.end('data: [DONE]\n\n');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const runtime=createHarnessRuntime({dataDir,allowTestEndpoint:true,timeoutMs:90000});
  const speech=createSpeechEngine({resourceDir:path.join(resources,'speech'),tempDir:path.join(dataDir,'speech-temp')});
  try{
    const result=await runtime.run({chatId:'packaged-check',agentId:'claude',provider:'apimart',model:'claude-local-smoke',apiKey:'local-mock-key',baseURL:`http://127.0.0.1:${server.address().port}/v1`,prompt:'写一个真实求和测试并运行，交付测试文件。',onEvent:event=>events.push(event),requestApproval:async request=>{approvals.push(request);assert.equal(request.codeHash.length,64);assert.match(request.sourcePreview,/packaged runtime/);return true;}});
    assert.equal(requests.length,4);assert.equal(approvals.length,1);assert.equal(result.files.length,1);assert.equal(result.tests[0].exitCode,0,result.tests[0].stderr);assert.match(await readFile(result.files[0].path,'utf8'),/packaged runtime/);assert.ok(events.some(event=>event.type==='artifact'));
    const ready=await speech.status();assert.equal(ready.available,true,ready.message);
    const transcript=await speech.transcribe({base64:(await readFile(fixture)).toString('base64'),mime:'audio/wav',language:'en'});
    assert.match(transcript.text,/ask not/i);assert.match(transcript.text,/country/i);
    const report={passed:true,node:process.version,electron:process.versions.electron,cliPath,modelRequests:requests.length,approvals:approvals.length,files:result.files.map(({name,bytes,sha256})=>({name,bytes,sha256})),testExitCode:result.tests[0].exitCode,transcript:transcript.text,checks:['ASAR 内 Harness 与插件依赖加载','本地模拟端点调用原模型 ID','真实写文件、审批、Node 测试与交付','安装包内 Whisper 本地语音识别']};
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }finally{speech.dispose();await runtime.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
