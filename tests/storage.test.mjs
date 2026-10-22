import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createService} from '../core/service.mjs';
import {DEFAULT_AGENTS,DEFAULT_MODELS} from '../core/catalog.mjs';

const testRoot=path.resolve('.test-data/storage');
async function fixture(t,initial){
  await fs.mkdir(testRoot,{recursive:true});const dataDir=await fs.mkdtemp(path.join(testRoot,'case-'));
  if(initial)await fs.writeFile(path.join(dataDir,'conversations.json'),JSON.stringify(initial));
  const calls=[];
  const options={dataDir,keys:{get:async()=> 'local-test-key'},fileStore:{list:async()=>[],importData:async(files,scope)=>{calls.push(scope);return [];}},fetchImpl:async()=>{throw new Error('network not expected');}};
  const service=await createService(options);t.after(()=>service.close());return {service,dataDir,options,calls};
}

test('each agent gets its own directory and chat content is stored outside the shared index',async t=>{
  const {service,dataDir,options}=await fixture(t);
  for(const agent of DEFAULT_AGENTS)assert.ok((await fs.stat(path.join(dataDir,'agents',agent.id,'conversations'))).isDirectory());
  const direct=await service.call('createChat',{agentIds:['claude']});
  const group=await service.call('createChat',{agentIds:['gpt','kimi'],title:'分工群'});
  const directPath=path.join(dataDir,'agents/claude/conversations',`${direct.id}.json`);
  const groupPath=path.join(dataDir,'groups',group.id,'conversations',`${group.id}.json`);
  assert.equal(JSON.parse(await fs.readFile(directPath)).id,direct.id);
  assert.equal(JSON.parse(await fs.readFile(groupPath)).id,group.id);
  const index=JSON.parse(await fs.readFile(path.join(dataDir,'conversations.json')));
  assert.equal(index.storageVersion,2);assert.ok(index.chats.every(chat=>!Object.hasOwn(chat,'messages')));
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir,'agents/claude/profile.json'))).id,'claude');
  await service.close();const reopened=await createService(options);assert.equal((await reopened.getState()).chats.length,2);await reopened.close();
});

test('dragged files are assigned a valid chat storage scope',async t=>{
  const {service,calls}=await fixture(t);
  const chat=await service.call('createChat',{agentIds:['kimi']});
  await service.call('importFileData',{chatId:chat.id,files:[]});assert.equal(calls[0].scope,'agents/kimi');
  await assert.rejects(()=>service.call('importFileData',{chatId:'../outside',files:[]}),/会话/);
});

test('legacy inline chat records load and are split on the next save',async t=>{
  const old={agents:DEFAULT_AGENTS,models:DEFAULT_MODELS,chats:[{id:'legacy-chat',agentIds:['gpt'],type:'direct',title:'旧记录',messages:[{id:'old',role:'user',content:'保留这段话',status:'complete'}]}]};
  const {service,dataDir}=await fixture(t,old);
  await service.call('updateChat',{id:'legacy-chat',title:'已恢复'});
  const chat=JSON.parse(await fs.readFile(path.join(dataDir,'agents/gpt/conversations/legacy-chat.json')));
  assert.equal(chat.messages[0].content,'保留这段话');
});

test('deleting a chat removes its own transcript and leaves other agents intact',async t=>{
  const {service,dataDir}=await fixture(t);
  const first=await service.call('createChat',{agentIds:['claude']});const second=await service.call('createChat',{agentIds:['gpt']});
  await service.call('deleteChat',{id:first.id});
  await assert.rejects(()=>fs.stat(path.join(dataDir,'agents/claude/conversations',`${first.id}.json`)),{code:'ENOENT'});
  assert.ok((await fs.stat(path.join(dataDir,'agents/gpt/conversations',`${second.id}.json`))).isFile());
});
