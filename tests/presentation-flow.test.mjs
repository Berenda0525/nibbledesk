import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {createService} from '../core/service.mjs';
import {createFileStore} from '../desktop/file-store.mjs';
import {exportPresentationPptx} from '../core/presentations.mjs';

const testRoot=fileURLToPath(new URL('../.test-data/presentation-flow/',import.meta.url));
const deck=(bullet='先确定验收目标')=>({title:'AI 工作实践',templateId:'business',slides:[
  {id:'cover',layout:'title',title:'AI 工作实践',subtitle:'把问题变成可检查的成果'},
  {id:'actions',layout:'bullets',title:'行动建议',bullets:[bullet,'在真实任务中验证']},
]});
const response=value=>new Response(JSON.stringify({choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)},finish_reason:'stop'}],usage:{total_tokens:100}}),{status:200});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function until(read,description){const end=Date.now()+6000;while(Date.now()<end){const result=await read();if(result)return result;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error(`等待超时：${description}`);}
const finished=(service,id)=>until(async()=>{const chat=(await service.getState()).chats.find(item=>item.id===id);return !chat.running&&chat;},'演示生成完成');

async function fixture(t,{reply=()=>response(deck()),wrapStore=value=>value}={}){
  await fs.mkdir(testRoot,{recursive:true});const dataDir=await fs.mkdtemp(path.join(testRoot,'case-'));
  const files=await createFileStore(dataDir),requests=[];
  const service=await createService({dataDir,fileStore:wrapStore(files),keys:{get:async()=> 'fixture-key'},fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});return reply(body,requests.length);}});
  t.after(()=>service.close());return {dataDir,files,service,requests};
}

test('群聊自然语言制作请求自动选择一位助手并归档真实可编辑 PPTX',{timeout:10000},async t=>{
  const {dataDir,files,service,requests}=await fixture(t);
  const chat=await service.call('createChat',{agentIds:['kimi','gpt','claude'],title:'演示协作'});
  await service.call('sendMessage',{chatId:chat.id,text:'帮我制作一个介绍 AI 工作实践的 PPT',presentationTemplate:'dark',rounds:3});
  const completed=await finished(service,chat.id),answer=completed.messages.at(-1);
  assert.equal(requests.length,1,'演示任务应仅执行一次，而不是让全群重复制作');
  assert.equal(answer.agentId,'claude');assert.equal(answer.kind,'presentation');assert.equal(answer.status,'complete');
  assert.equal(answer.attachments.length,1);
  const asset=await files.get(answer.attachments[0].id);assert.equal(asset.scope,`groups/${chat.id}`);assert.equal(asset.presentation.deck.templateId,'dark');
  assert.equal(completed.presentationId,asset.id);assert.equal(asset.presentation.chatId,chat.id);
  const filename=await files.resolve(asset.id);assert.equal(filename,path.join(dataDir,'groups',chat.id,'files',asset.id));
  const zip=await JSZip.loadAsync(await files.readBuffer(asset.id));assert.ok(zip.file('ppt/slides/slide1.xml'));assert.match(await zip.file('ppt/slides/slide2.xml').async('string'),/先确定验收目标/);
  const reopened=await createFileStore(dataDir);assert.equal((await reopened.get(asset.id)).presentation.deck.slides[1].id,'actions');
});

test('群内指定演示助手使用该成员原模型且只调用一次',{timeout:10000},async t=>{
  const {service,requests}=await fixture(t),state=await service.getState();
  const chat=await service.call('createChat',{agentIds:['claude','gpt','kimi']});
  await service.call('sendMessage',{chatId:chat.id,text:'生成一份 PPT',presentationAgentId:'kimi',rounds:3});
  const completed=await finished(service,chat.id);
  assert.equal(requests.length,1);assert.equal(requests[0].body.model,state.agents.find(agent=>agent.id==='kimi').model);
  assert.equal(completed.messages.at(-1).agentId,'kimi');assert.equal(completed.messages.at(-1).status,'complete');
});

test('继续聊天修改建立新版本并保留上一版文件与页面编号',{timeout:10000},async t=>{
  const {service,files,requests}=await fixture(t,{reply:(_body,n)=>response(deck(n===1?'初稿内容':'修订后的内容'))});
  const chat=await service.call('createChat',{agentIds:['claude']});
  await service.call('sendMessage',{chatId:chat.id,text:'帮我制作一份 PPT'});
  const first=await finished(service,chat.id),firstId=first.presentationId,firstBuffer=await files.readBuffer(firstId);
  await service.call('sendMessage',{chatId:chat.id,text:'修改第二页，把第一条说得更具体'});
  const second=await finished(service,chat.id),secondId=second.presentationId;
  assert.notEqual(secondId,firstId);assert.equal((await files.list()).length,2);
  assert.deepEqual(await files.readBuffer(firstId),firstBuffer);
  const latest=await files.get(secondId);assert.equal(latest.presentation.previousId,firstId);assert.equal(latest.presentation.deck.slides[1].id,'actions');assert.match(latest.text,/修订后的内容/);
  const user=JSON.parse(requests[1].body.messages.at(-1).content);assert.equal(user.currentPresentation.slides[1].bullets[0],'初稿内容');
  assert.equal(second.messages.filter(item=>item.kind==='presentation').length,2);
});

test('手动保存后的最新文稿文字和重排页序进入 AI 续改提示',{timeout:10000},async t=>{
  const {service,files,requests}=await fixture(t);
  const chat=await service.call('createChat',{agentIds:['claude']});
  await service.call('sendMessage',{chatId:chat.id,text:'帮我制作一份 PPT'});
  const first=await finished(service,chat.id),original=await files.get(first.presentationId);
  const editedZip=await JSZip.loadAsync(await exportPresentationPptx(deck('OFFICE_EDITED_人工修改的唯一内容')));
  const presentation=await editedZip.file('ppt/presentation.xml').async('string');
  editedZip.file('ppt/presentation.xml',presentation.replace(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/,(_whole,list)=>`<p:sldIdLst>${[...list.matchAll(/<p:sldId\b[^>]*\/>/g)].map(match=>match[0]).reverse().join('')}</p:sldIdLst>`));
  const editedBuffer=await editedZip.generateAsync({type:'nodebuffer'});
  await files.updateDocument(original.id,{buffer:editedBuffer,revision:original.revision});
  assert.equal((await files.get(original.id)).presentation.manuallyEdited,true);
  await service.call('sendMessage',{chatId:chat.id,text:'修改第二页，让表述更简洁'});
  await finished(service,chat.id);
  const user=JSON.parse(requests[1].body.messages.at(-1).content);
  assert.match(user.referenceMaterials,/OFFICE_EDITED_人工修改的唯一内容/);
  assert.match(user.referenceMaterials,/第 1 页[\s\S]*OFFICE_EDITED_人工修改的唯一内容[\s\S]*第 2 页/,'页码应采用用户重排后的展示顺序');
  assert.equal(user.currentPresentation,undefined,'手改后的文件不应被旧结构覆盖');
  assert.deepEqual(await files.readBuffer(original.id),editedBuffer,'AI 修改应保留当前手改版本');
});

test('余额不足与不完整 JSON 保留错误状态且不生成交付文件',{timeout:10000},async t=>{
  for(const reply of [()=>new Response(JSON.stringify({error:{message:'insufficient balance'}}),{status:402}),()=>response('{"title":"内容未完成"')]){
    const {service,files}=await fixture(t,{reply});const chat=await service.call('createChat',{agentIds:['claude']});
    await service.call('sendMessage',{chatId:chat.id,text:'帮我制作一份 PPT'});
    const completed=await finished(service,chat.id),answer=completed.messages.at(-1);
    assert.equal(answer.status,'error');assert.ok(answer.error);assert.equal(answer.attachments.length,0);assert.equal((await files.list()).length,0);assert.equal(completed.presentationId,undefined);
  }
});

test('PPT 文件保存阶段停止任务应取消并避免交付成品',{timeout:10000},async t=>{
  const entered=deferred(),release=deferred();let saveSignal;
  t.after(()=>release.resolve());
  const {service,files}=await fixture(t,{wrapStore:store=>({...store,createDocument:async input=>{saveSignal=input.signal;entered.resolve();await release.promise;return store.createDocument(input);}})});
  const chat=await service.call('createChat',{agentIds:['claude']});
  await service.call('sendMessage',{chatId:chat.id,text:'帮我制作一份 PPT'});await entered.promise;
  await service.call('stopChat',{chatId:chat.id});release.resolve();
  const completed=await finished(service,chat.id),answer=completed.messages.at(-1);
  assert.equal(answer.status,'cancelled');assert.ok(saveSignal instanceof AbortSignal);assert.equal(saveSignal.aborted,true);
  assert.equal(answer.attachments.length,0);assert.equal((await files.list()).length,0);assert.equal(completed.presentationId,undefined);
});
