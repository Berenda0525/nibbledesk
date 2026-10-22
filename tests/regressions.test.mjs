import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createService} from '../core/service.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const reply=text=>new Response(JSON.stringify({choices:[{message:{content:text},finish_reason:'stop'}]}),{status:200});

async function until(read,description){
  const deadline=Date.now()+3000;
  while(Date.now()<deadline){const value=await read();if(value)return value;await new Promise(r=>setTimeout(r,5));}
  throw new Error(`Timed out: ${description}`);
}

async function fixture(t,{assets=[],fetchImpl,saveRemoteImage,keys}={}){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'starchat-regression-'));
  const metadata=asset=>{if(!asset)return null;const {base64,...rest}=asset;return rest;};
  const fileStore={
    list:async()=>assets.map(metadata),
    get:async id=>metadata(assets.find(asset=>asset.id===id)),
    read:async id=>assets.find(asset=>asset.id===id),
    saveRemoteImage:saveRemoteImage??(async()=>{throw new Error('Unexpected image save');}),
  };
  const service=await createService({dataDir,fileStore,keys:keys??{get:async()=> 'TEST_KEY'},fetchImpl});
  t.after(()=>service.close());
  return service;
}

const finished=(service,id)=>until(async()=>{
  const chat=(await service.getState()).chats.find(chat=>chat.id===id);
  return !chat.running&&chat;
},'chat completion');

test('concurrent sends start one provider request and its run remains stoppable',{timeout:5000},async t=>{
  let validating=false,validationReads=0,requests=0;
  const bothValidated=deferred();
  const keys={get:async()=>{
    if(validating&&validationReads<2){validationReads++;if(validationReads===2)bothValidated.resolve();await bothValidated.promise;}
    return 'TEST_KEY';
  }};
  const service=await fixture(t,{keys,fetchImpl:async(_url,{signal})=>{
    requests++;
    return new Promise((_resolve,reject)=>{
      if(signal.aborted){reject(signal.reason);return;}
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
  }});
  const chat=await service.call('createChat',{agentIds:['claude','kimi']});
  validating=true;
  const sends=await Promise.allSettled([
    service.call('sendMessage',{chatId:chat.id,text:'第一条'}),
    service.call('sendMessage',{chatId:chat.id,text:'第二条'}),
  ]);
  assert.equal(sends.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(sends.filter(result=>result.status==='rejected').length,1);
  assert.match(sends.find(result=>result.status==='rejected').reason.message,/正在回复/);
  await until(()=>requests===1,'first provider request');
  await service.call('stopChat',{chatId:chat.id});
  const complete=await finished(service,chat.id);
  assert.equal(requests,1,'the next group member must not start after cancellation');
  assert.equal(complete.messages.filter(message=>message.role==='user').length,1);
  assert.equal(complete.messages.at(-1).status,'cancelled');
});

test('three short document attachments all enter the model prompt',{timeout:5000},async t=>{
  const documents=[1,2,3].map(n=>({id:`doc-${n}`,name:`资料${n}.txt`,type:'document',text:`UNIQUE_DOCUMENT_${n}`}));
  let request;
  const service=await fixture(t,{assets:documents,fetchImpl:async(_url,options)=>{request=JSON.parse(options.body);return reply('已阅读');}});
  const chat=await service.call('createChat',{agentIds:['claude']});
  await service.call('sendMessage',{chatId:chat.id,text:'总结三份资料',attachmentIds:documents.map(doc=>doc.id)});
  await finished(service,chat.id);
  const prompt=JSON.stringify(request.messages);
  for(const document of documents)assert.ok(prompt.includes(document.text),`${document.name} content must be retained`);
  assert.equal(prompt.includes('文件内容达到本轮上下文限制'),false);
});

test('new document receives budget before historical attachments while message order is preserved',{timeout:5000},async t=>{
  const latestText='LATEST_DOCUMENT_START\n'+'C'.repeat(29950)+'\nLATEST_DOCUMENT_END';
  const documents=[
    {id:'old-1',name:'旧资料一.txt',type:'document',text:'A'.repeat(30000)},
    {id:'old-2',name:'旧资料二.txt',type:'document',text:'B'.repeat(30000)},
    {id:'newest',name:'本轮资料.txt',type:'document',text:latestText},
  ];
  const requests=[];
  const service=await fixture(t,{assets:documents,fetchImpl:async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    return reply(requests.length===1?'此前资料已阅读':'本轮资料已阅读');
  }});
  const chat=await service.call('createChat',{agentIds:['claude']});
  await service.call('sendMessage',{chatId:chat.id,text:'请阅读此前资料',attachmentIds:['old-1','old-2']});
  await finished(service,chat.id);
  await service.call('sendMessage',{chatId:chat.id,text:'请分析本轮新资料',attachmentIds:['newest']});
  await finished(service,chat.id);
  assert.equal(requests.length,2);
  const messages=requests[1].messages;
  assert.deepEqual(messages.map(message=>message.role),['system','user','assistant','user']);
  assert.ok(messages[1].content.startsWith('请阅读此前资料'));
  assert.equal(messages[2].content,'此前资料已阅读');
  assert.ok(messages[3].content.startsWith('请分析本轮新资料'));
  assert.ok(messages[3].content.includes(latestText),'the entire newest document must survive historical budget pressure');
  assert.equal(messages[3].content.includes('文件内容达到本轮上下文限制'),false);
  assert.ok(messages[1].content.includes('文件内容达到本轮上下文限制'),'the budget should truncate historical files first');
});

test('switching to a text-only model omits historical image bytes but preserves context',{timeout:5000},async t=>{
  const asset={id:'image-1',name:'参考.png',type:'image',mime:'image/png',base64:'eA=='};
  const requests=[];
  const service=await fixture(t,{assets:[asset],fetchImpl:async(_url,options)=>{requests.push(JSON.parse(options.body));return reply('已阅读图片');}});
  const chat=await service.call('createChat',{agentIds:['kimi']});
  await service.call('sendMessage',{chatId:chat.id,text:'请看参考图',attachmentIds:[asset.id]});
  await finished(service,chat.id);
  assert.ok(JSON.stringify(requests[0]).includes('image_url'));
  await service.call('updateAgent',{id:'kimi',model:'kimi-k2.6'});
  await service.call('sendMessage',{chatId:chat.id,text:'继续讨论文字说明'});
  await finished(service,chat.id);
  assert.equal(requests[1].model,'kimi-k2.6');
  const prompt=JSON.stringify(requests[1].messages);
  assert.equal(prompt.includes('image_url'),false);
  assert.equal(prompt.includes('data:image/'),false);
  assert.ok(prompt.includes('参考.png'));
  assert.ok(prompt.includes('已阅读图片'));
  assert.ok(prompt.includes('继续讨论文字说明'));
});

test('stopping during image persistence records cancellation even when saving resolves',{timeout:5000},async t=>{
  const saveStarted=deferred(),finishSave=deferred();
  let saveSignal;
  t.after(()=>finishSave.resolve());
  const service=await fixture(t,{
    fetchImpl:async()=>new Response(JSON.stringify({data:[{b64_json:'eA=='}]}),{status:200}),
    saveRemoteImage:async({signal})=>{
      saveSignal=signal;saveStarted.resolve();
      await finishSave.promise;
      return {id:'generated-1',name:'成品.png',type:'image',mime:'image/png'};
    },
  });
  const chat=await service.call('createChat',{agentIds:['claude']});
  await service.call('sendMessage',{chatId:chat.id,text:'画一颗星星',mode:'image',imageProvider:'apimart',imageModel:'gpt-image-2.5-flare'});
  await saveStarted.promise;
  assert.ok(saveSignal instanceof AbortSignal,'the file save must receive the run cancellation signal');
  await service.call('stopChat',{chatId:chat.id});
  assert.equal(saveSignal.aborted,true);
  finishSave.resolve();
  const complete=await finished(service,chat.id);
  assert.equal(complete.messages.at(-1).status,'cancelled');
  assert.equal(complete.messages.at(-1).content,'');
  assert.equal(complete.messages.at(-1).attachments.length,0);
});
