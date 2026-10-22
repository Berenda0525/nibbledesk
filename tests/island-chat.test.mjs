import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createService} from '../core/service.mjs';
import {createIslandChatController} from '../core/island-chat.mjs';
import {updateProfile,normalizeDesktop} from '../core/profile.mjs';

async function fixture(t,fetchImpl){
 await fs.mkdir('.test-data/island-chat',{recursive:true});
 const dataDir=await fs.mkdtemp(path.resolve('.test-data/island-chat/case-')),requests=[],snapshots=[];
 let controller;const options={dataDir,keys:{get:async()=> 'ISLAND_TEST_ONLY'},fileStore:{list:async()=>[]},fetchImpl:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return fetchImpl?fetchImpl(url,options):new Response(JSON.stringify({choices:[{message:{content:'快聊答复'}}]}));},emit:event=>controller?.handleEvent(event)};
 const service=await createService(options);controller=createIslandChatController({service,onSnapshot:value=>snapshots.push(value)});t.after(()=>service.close());
 return {service,controller,options,requests,snapshots};
}
async function idle(service,chatId){for(let i=0;i<200;i++){const chat=(await service.getState()).chats.find(item=>item.id===chatId);if(!chat.running)return chat;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('回复未结束');}

test('island uses selected original model with separate persisted history and reopens same conversation',async t=>{
 const {service,controller,options,requests,snapshots}=await fixture(t);
 const main=await service.call('createChat',{agentIds:['claude'],title:'工作记录'});
 assert.equal((await controller.read({agentId:'claude'})).chatId,null);
 const started=await controller.send({agentId:'claude',text:'你好'});await idle(service,started.chatId);
 const answer=await controller.read({agentId:'claude'});assert.notEqual(answer.chatId,main.id);assert.equal(answer.messages.at(-1).content,'快聊答复');
 const state=await service.getState();assert.equal(requests[0].body.model,state.agents.find(a=>a.id==='claude').model);assert.equal(state.chats.find(c=>c.id===main.id).messages.length,0);
 assert.ok(snapshots.some(s=>s.running));assert.equal(JSON.stringify(answer).includes('ISLAND_TEST_ONLY'),false);
 await service.close();const reopened=await createService(options);t.after(()=>reopened.close());const next=createIslandChatController({service:reopened});assert.equal((await next.read({agentId:'claude'})).chatId,answer.chatId);
 const fresh=await next.newChat({agentId:'claude'});assert.notEqual(fresh.chatId,answer.chatId);assert.equal(fresh.messages.length,0);assert.equal((await reopened.getState()).chats.find(c=>c.id===answer.chatId).messages.length,2);
});

test('island rejects invalid or foreign chat parameters before provider requests',async t=>{
 const {service,controller,requests}=await fixture(t);const main=await service.call('createChat',{agentIds:['claude']});const other=await controller.newChat({agentId:'kimi'});
 for(const input of [{agentId:'missing',text:'x'},{agentId:'claude',text:' '},{agentId:'claude',text:'x'.repeat(12001)},{agentId:'claude',chatId:main.id,text:'x'},{agentId:'claude',chatId:other.chatId,text:'x'}])await assert.rejects(controller.send(input));
 assert.equal(requests.length,0);assert.equal((await service.getState()).chats.length,2);
});

test('island serializes same-agent sends and stop cancels provider without losing history',async t=>{
 const {service,controller,requests}=await fixture(t,async(_url,{signal})=>new Promise((_resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}));
 const first=controller.send({agentId:'claude',text:'长回复'});await assert.rejects(controller.send({agentId:'claude',text:'重复发送'}),/正在发送/);const started=await first;
 await assert.rejects(controller.newChat({agentId:'claude'}),/停止/);await controller.stop({agentId:'claude',chatId:started.chatId});const ended=await idle(service,started.chatId);
 assert.equal(ended.messages[0].content,'长回复');assert.equal(ended.running,false);assert.ok(requests.length<=1);
});

test('desktop profile migration preserves supported choices and drops retired selection settings',()=>{
 const legacy={islandEnabled:false,closeToIsland:true,doNotDisturb:true,notificationsEnabled:false,selectionEnabled:true,selectionShortcut:'Control+Alt+G'};
 assert.deepEqual(normalizeDesktop(legacy),{islandEnabled:false,closeToIsland:true,doNotDisturb:true,notificationsEnabled:false});
 assert.equal(Object.hasOwn(updateProfile({desktop:legacy},{displayName:'瓜'}).desktop,'selectionEnabled'),false);
});
