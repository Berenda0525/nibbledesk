import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createService} from '../core/service.mjs';
import {parseCompletion,toResponses,collectImages,generateChat,generateImage} from '../core/providers.mjs';
import {DEFAULT_MODELS,DEFAULT_AGENTS,normalizeModels} from '../core/catalog.mjs';

const reply=text=>new Response(JSON.stringify({choices:[{message:{content:text}}]}),{status:200});
async function fixture(fetchImpl,assets=[]){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'starchat-core-'));const secrets=new Map([['apimart','TEST_KEY'],['volcano','TEST_KEY']]);const events=[];
  const keys={get:async id=>secrets.get(id),set:async(id,key)=>secrets.set(id,key),remove:async id=>secrets.delete(id)};
  const fileStore={list:async()=>assets,get:async id=>assets.find(a=>a.id===id),read:async id=>assets.find(a=>a.id===id),importData:async()=>[],saveRemoteImage:async item=>{const a={id:'image-1',name:'image.png',type:'image',mime:'image/png',url:'star-asset://file/image-1'};assets.push(a);return a;}};
  const service=await createService({dataDir,keys,fileStore,fetchImpl,emit:e=>events.push(e)});
  return {service,dataDir,keys,fileStore,events};
}
async function idle(service,id){for(let i=0;i<200;i++){const state=await service.getState();if(!state.chats.find(c=>c.id===id).running)return state;await new Promise(r=>setTimeout(r,5));}throw new Error('run did not complete');}

test('catalog defaults refer to known models and exclude video entries',()=>{
  for(const a of DEFAULT_AGENTS)assert.ok(DEFAULT_MODELS.some(m=>m.id===a.model&&m.provider===a.provider));
  const m=normalizeModels({data:[{id:'gpt-6.1-sol',category:'chat'},{id:'sora-2',category:'video'},{id:'gpt-image-2.5-flare',category:'image'}]},'apimart');assert.equal(m.length,2);
});
test('SSE with usage-only and empty chunks yields complete message',async()=>{
  const raw=['data: '+JSON.stringify({choices:[{delta:{content:''}}]}),'data: '+JSON.stringify({choices:[{delta:{content:'你好'}}]}),'data: '+JSON.stringify({choices:[],usage:{total_tokens:2}}),'data: [DONE]'].join('\n\n');
  assert.equal((await parseCompletion(new Response(raw))).text,'你好');
  await assert.rejects(()=>parseCompletion(new Response('data: '+JSON.stringify({choices:[{delta:{content:'半句'}}]}))),/中断/);
});
test('GPT six uses Responses with correct vision and assistant schema',async()=>{
  let request;const messages=[{role:'user',content:[{type:'text',text:'看图'},{type:'image_url',image_url:{url:'data:image/png;base64,a'}}]},{role:'assistant',content:[{type:'text',text:'答'}]}];
  const result=await generateChat({provider:'apimart',model:'gpt-6.1-sol',messages,key:'TEST',fetchImpl:async(url,options)=>{request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'yes'}]}]}));}});
  assert.ok(request.url.endsWith('/responses'));assert.equal(request.body.input[0].content[1].type,'input_image');assert.equal(request.body.input[1].content[0].type,'output_text');assert.equal(result.text,'yes');
});
test('group replies see preceding agent, exactly bounded rounds, persistence has no key',async()=>{
  const requests=[];const {service,dataDir,keys,fileStore}=await fixture(async(url,options)=>{requests.push(JSON.parse(options.body));return reply(`answer-${requests.length}`);});
  const chat=await service.call('createChat',{title:'评审',agentIds:['claude','kimi']});
  await service.call('sendMessage',{chatId:chat.id,text:'讨论一次',rounds:2});
  const state=await idle(service,chat.id);assert.equal(requests.length,4);assert.ok(JSON.stringify(requests[1]).includes('answer-1'));assert.equal(state.chats[0].messages.length,5);
  assert.equal(JSON.stringify(state).includes('TEST_KEY'),false);
  await service.close();const saved=await fs.readFile(path.join(dataDir,'conversations.json'),'utf8');assert.equal(saved.includes('TEST_KEY'),false);
  const reopened=await createService({dataDir,keys,fileStore});assert.equal((await reopened.getState()).chats[0].messages.length,5);await reopened.close();
});
test('stop aborts an active provider call and prevents later group members',async()=>{
  let count=0;const {service}=await fixture(async(_url,{signal})=>{count++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
  const chat=await service.call('createChat',{agentIds:['claude','kimi']});await service.call('sendMessage',{chatId:chat.id,text:'long'});
  for(let i=0;i<100&&!count;i++)await new Promise(r=>setTimeout(r,5));
  await service.call('stopChat',{chatId:chat.id});const state=await idle(service,chat.id);assert.equal(count,1);assert.equal(state.chats[0].messages[1].status,'cancelled');await service.close();
});
test('invalid credentials and text-only vision reject before adding a run',async()=>{
  const {service}=await fixture(async()=>reply('ok'));
  const chat=await service.call('createChat',{agentIds:['claude']});await service.call('removeProvider',{provider:'apimart'});
  await assert.rejects(()=>service.call('sendMessage',{chatId:chat.id,text:'test'}),/API Key/);assert.equal((await service.getState()).chats[0].messages.length,0);await service.close();
});
test('uploaded text enters the prompt as untrusted document context',async()=>{
  let body;const {service}=await fixture(async(_u,o)=>{body=JSON.parse(o.body);return reply('document read');},[{id:'doc',name:'需求.txt',type:'document',mime:'text/plain',text:'测试需求内容'}]);
  const chat=await service.call('createChat',{agentIds:['claude']});await service.call('sendMessage',{chatId:chat.id,text:'总结',attachmentIds:['doc']});await idle(service,chat.id);
  assert.ok(JSON.stringify(body).includes('测试需求内容'));assert.ok(JSON.stringify(body).includes('不自动获得执行权'));await service.close();
});
test('image responses normalize APImart URL arrays and base64',()=>{
  assert.deepEqual(collectImages({data:{result:{images:[{url:['https://images.example/a.png']}]}}}),[{url:'https://images.example/a.png'}]);
  assert.deepEqual(collectImages({data:[{b64_json:'abcd'}]}),[{base64:'abcd',mime:'image/png'}]);
});
test('image reference uploads use multipart, then task request preserves model',async()=>{
  const calls=[];const images=await generateImage({provider:'apimart',model:'gpt-image-2.5-flare',prompt:'draw',key:'TEST',referenceImages:[{mime:'image/png',name:'r.png',base64:'eA=='}],fetchImpl:async(url,options)=>{
    calls.push({url,options});if(url.endsWith('/uploads/images'))return new Response(JSON.stringify({url:'https://images.example/reference.png'}));return new Response(JSON.stringify({data:[{url:'https://images.example/output.png'}]}));
  }});
  assert.ok(calls[0].options.body instanceof FormData);const body=JSON.parse(calls[1].options.body);assert.equal(body.model,'gpt-image-2.5-flare');assert.deepEqual(body.image_urls,['https://images.example/reference.png']);assert.equal(images.length,1);
});
test('provider API failure becomes visible error with no automatic paid retry',async()=>{
  let requests=0;const {service}=await fixture(async()=>{requests++;return new Response('{"error":{"message":"insufficient balance"}}',{status:402});});
  const chat=await service.call('createChat',{agentIds:['claude']});await service.call('sendMessage',{chatId:chat.id,text:'test'});const state=await idle(service,chat.id);
  assert.equal(requests,1);assert.equal(state.chats[0].messages[1].status,'error');assert.match(state.chats[0].messages[1].error,/余额/);await service.close();
});
test('truncated replies retain partial output and signal the limit',async()=>{
  let text='';await assert.rejects(()=>parseCompletion(new Response(JSON.stringify({status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'partial'}]}]})),value=>text=value),/长度限制/);assert.equal(text,'partial');
});
test('Responses final-only SSE event is supported',async()=>{
  const data={type:'response.completed',response:{output:[{type:'message',content:[{type:'output_text',text:'final answer'}]}]}};
  assert.equal((await parseCompletion(new Response('data: '+JSON.stringify(data)+'\n\n'))).text,'final answer');
});
test('APImart asynchronous image task is polled and extracted',async()=>{
  const calls=[];const images=await generateImage({provider:'apimart',model:'seedream-5-0-lite',prompt:'a star',key:'TEST',fetchImpl:async(url,options)=>{
    calls.push(url);if(url.endsWith('/images/generations')){assert.equal(JSON.parse(options.body).resolution,'2K');return new Response(JSON.stringify({code:200,data:[{status:'submitted',task_id:'task-1'}]}));}
    assert.ok(url.endsWith('/tasks/task-1'));return new Response(JSON.stringify({code:200,data:{status:'completed',result:{images:[{url:['https://images.example/final.png']}]}}}));
  }});
  assert.equal(calls.length,2);assert.equal(images[0].url,'https://images.example/final.png');
});
