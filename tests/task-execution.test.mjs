import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createService} from '../core/service.mjs';
import {createFileStore} from '../desktop/file-store.mjs';
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
async function waitFor(fn){for(let i=0;i<500;i++){const value=await fn();if(value)return value;await pause();}throw Error('test timeout');}
async function fixture(run){
 await fs.mkdir('.test-data/task-service',{recursive:true});const dataDir=await fs.mkdtemp(path.resolve('.test-data/task-service/run-')),fileStore=await createFileStore(dataDir),events=[],calls=[];
 const runner={workspace:id=>path.join(dataDir,'tasks',id,'workspace'),async run(params){calls.push(params);await fs.mkdir(this.workspace(params.chatId),{recursive:true});return run(params,this);}};
 const keys={get:async()=> 'task-test-secret'};const service=await createService({dataDir,keys,fileStore,taskRunner:runner,emit:event=>events.push(event)});
 return {service,dataDir,fileStore,events,calls,runner};
}
test('group tasks preserve selected models, share only their workspace, deliver real bytes and retain independent new chat',async()=>{
 const f=await fixture(async(p,r)=>{const workspace=r.workspace(p.chatId);const file=path.join(workspace,`${p.agentId}.mjs`);await fs.writeFile(file,`// ${p.agentId}`);p.onEvent({type:'tool_result',name:'workspace_write',result:{path:file,ok:true}});return {text:`${p.agentId} 完成 task-test-secret`,workspace,files:[{path:file}],tests:[{path:'test.mjs',mode:'test',passed:false,exitCode:1}],status:'completed'};});
 try{
 const c=await f.service.call('createChat',{agentIds:['claude','gpt','gemini','deepseek','kimi','doubao']});const initial=await f.service.getState();
 await f.service.call('sendMessage',{chatId:c.id,text:'分工完成并测试',mode:'task'});
 const done=await waitFor(async()=>{const s=await f.service.getState();return !s.chats[0].running&&s;});assert.equal(f.calls.length,6);
 for(const [i,p]of f.calls.entries()){assert.equal(p.model,initial.agents.find(a=>a.id===p.agentId).model);assert.equal(p.provider,initial.agents.find(a=>a.id===p.agentId).provider);if(i)assert.match(p.prompt,new RegExp(f.calls[i-1].agentId+' 完成'));}
 assert.equal(done.chats[0].messages.at(-1).attachments.length,1);assert.match(done.chats[0].messages.at(-1).content,/0\/1/);assert.doesNotMatch(JSON.stringify(done),/task-test-secret/);assert.match(JSON.stringify(done.chats[0].taskEvents),/workspace_write/);
 const delivered=done.chats[0].messages.at(-1).attachments[0];assert.equal(await fs.readFile(await f.fileStore.resolve(delivered.id),'utf8'),'// doubao');assert.equal(delivered.scope,`groups/${c.id}`);
 const newer=await f.service.call('createChat',{agentIds:['claude']});assert.notEqual(f.runner.workspace(c.id),f.runner.workspace(newer.id));assert.equal(newer.messages.length,0);
 }finally{await f.service.close();}
});
test('task approvals carry exact source, are single use and stopping removes pending requests',async()=>{
 let approval;
 const f=await fixture(async(p,r)=>{approval=await p.requestApproval({command:'node --test a.mjs',cwd:r.workspace(p.chatId),reason:'test reason',sourcePreview:'console.log(1)',codeHash:'a'.repeat(64)});return {text:'完成',workspace:r.workspace(p.chatId),files:[],status:'completed'};});
 try{
 const c=await f.service.call('createChat',{agentIds:['claude']});await f.service.call('sendMessage',{chatId:c.id,text:'测试',mode:'task'});
 const request=await waitFor(async()=>(await f.service.getState()).pendingApprovals[0]);assert.equal(request.sourcePreview,'console.log(1)');assert.equal(request.codeHash.length,64);
 await f.service.call('resolveTaskApproval',{id:request.id,approved:true});await waitFor(async()=>!(await f.service.getState()).chats[0].running);assert.equal(approval,true);await assert.rejects(f.service.call('resolveTaskApproval',{id:request.id,approved:true}),/过期/);
 await f.service.call('sendMessage',{chatId:c.id,text:'再测试',mode:'task'});const second=await waitFor(async()=>(await f.service.getState()).pendingApprovals[0]);await f.service.call('stopChat',{chatId:c.id});await waitFor(async()=>!(await f.service.getState()).chats[0].running);assert.equal(approval,false);assert.equal((await f.service.getState()).pendingApprovals.length,0);assert.ok(f.events.some(e=>e.type==='task-approval-resolved'&&e.id===second.id));
 }finally{await f.service.close();}
});
test('delivered files outside a chat workspace are rejected',async()=>{
 const f=await fixture(async(p,r)=>({text:'done',workspace:r.workspace(p.chatId),files:[{path:path.resolve('package.json')}],status:'completed'}));
 try{const c=await f.service.call('createChat',{agentIds:['claude']});await f.service.call('sendMessage',{chatId:c.id,text:'测试边界',mode:'task'});const done=await waitFor(async()=>{const s=await f.service.getState();return !s.chats[0].running&&s;});assert.equal(done.chats[0].messages.at(-1).status,'error');assert.match(done.chats[0].messages.at(-1).error,/之外/);assert.equal(done.assets.length,0);}finally{await f.service.close();}
});
