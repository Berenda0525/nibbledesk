import {_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dataDir=await fs.mkdtemp(path.resolve('.test-data/harness-ui-1.6-')),env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let app,step=0;const errors=[],tools=new Set();
const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);for(const t of body.tools||[])tools.add(t.function.name);
 const actions=[['write',{file_path:'sum.test.mjs',content:'import test from "node:test";import assert from "node:assert/strict";test("sum",()=>assert.equal(4+5,9));'}],['run_node',{path:'sum.test.mjs',mode:'test'}],['deliver_file',{path:'sum.test.mjs'}]],action=actions[step++];
 res.writeHead(200,{'content-type':'text/event-stream'});const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'local-test',object:'chat.completion.chunk',model:body.model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 chunk(action?{tool_calls:[{index:0,id:'call-'+step,type:'function',function:{name:action[0],arguments:JSON.stringify(action[1])}}]}:{content:'已保存、运行测试并交付。'});chunk({},action?'tool_calls':'stop');res.end('data: [DONE]\n\n');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const packed=process.argv[2];app=await electron.launch(packed?{executablePath:path.join(packed,'瓜瓜.exe'),args:[],env,timeout:60000}:{args:[process.cwd()],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.getByLabel('APImart API Key').fill('harness-local-fixture');await page.getByRole('button',{name:'继续',exact:true}).click();await page.getByRole('button',{name:'跳过，进入聊天',exact:true}).click();
 await page.evaluate(baseUrl=>window.stellar.call('saveProvider',{provider:'apimart',baseUrl,key:'harness-local-fixture',api:'chat'}),`http://127.0.0.1:${server.address().port}/v1`);
 await page.getByRole('button',{name:'Harness',exact:true}).click();await page.getByRole('button',{name:'创建任务',exact:false}).click();await page.getByLabel('消息输入框').fill('生成一个求和测试并运行，交付文件');await page.getByRole('button',{name:'发送消息',exact:true}).click();
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'批准一次',exact:false}).waitFor({timeout:90000});await page.getByRole('button',{name:'批准一次',exact:false}).click();}
 await page.waitForFunction(()=>document.body.innerText.includes('实际测试：1/1'),{},{timeout:90000});
 const state=await page.evaluate(()=>window.stellar.call('bootstrap')),chat=state.chats.find(c=>c.entryPoint==='harness');assert.equal(chat.messages.at(-1).status,'complete',JSON.stringify(chat.messages.at(-1)));assert.equal(chat.messages.at(-1).attachments.length,1);assert.ok(tools.has('write')&&tools.has('pwsh')&&tools.has('subagent'));assert.ok(chat.harnessCapabilities.length>20);
 assert.equal(app.windows().filter(p=>p.url().startsWith('http://127.0.0.1:')&&!p.url().includes('/app/')).length,0,'执行模式由瓜瓜页面承载');
 await page.getByRole('button',{name:'引擎与工具',exact:false}).click();await page.getByText('当前会话工具',{exact:true}).waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.harness-tool-catalog')).opacity==='1');await page.screenshot({path:path.join(dataDir,'sdk-workspace.png')});assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(dataDir,'result.json'),JSON.stringify({passed:true,tools:[...tools],paidRequests:0,source:'local-model-fixture'},null,2));console.log(JSON.stringify({passed:true,dataDir,toolCount:tools.size,paidRequests:0}));
}finally{await app?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
