import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {inspectPresentationTemplate,fillPresentationTemplate} from '../core/presentation-template.mjs';
import {exportPresentationPptx} from '../core/presentations.mjs';
import {createService} from '../core/service.mjs';
import {createFileStore} from '../desktop/file-store.mjs';
const deck={title:'新主题',templateId:'business',slides:[{layout:'title',title:'新封面',subtitle:'新的副标题'},{layout:'bullets',title:'新的内容',bullets:['第一项','第二项']}]};
const original=async()=>exportPresentationPptx({...deck,title:'模板',templateId:'dark',slides:[{layout:'title',title:'{{title}}',subtitle:'{{subtitle}}'},{layout:'bullets',title:'{{title}}',bullets:['{{body}}']}]});
test('PPTX 替换内容保留全部母版、版式、主题、媒体和关系文件',async()=>{
 const buffer=await original(),info=await inspectPresentationTemplate(buffer);assert.equal(info.pageCount,2);assert.ok(info.pages.every(p=>p.hasBody));
 const result=await fillPresentationTemplate(buffer,deck),before=await JSZip.loadAsync(buffer),after=await JSZip.loadAsync(result);
 for(const name of Object.keys(before.files)){if(before.files[name].dir||/^ppt\/slides\/slide\d+\.xml$/.test(name))continue;assert.deepEqual(await after.file(name).async('nodebuffer'),await before.file(name).async('nodebuffer'),name);}
 assert.match(await after.file('ppt/slides/slide1.xml').async('string'),/新封面/);assert.match(await after.file('ppt/slides/slide2.xml').async('string'),/第一项/);
 await assert.rejects(fillPresentationTemplate(buffer,{...deck,slides:deck.slides.slice(0,1)}),/2 页/);
 const hostile=await JSZip.loadAsync(buffer);hostile.file('ppt/vbaProject.bin','macro');await assert.rejects(inspectPresentationTemplate(await hostile.generateAsync({type:'nodebuffer'})),/宏/);
});
test('模板注册、模型生成与续改复用同一原始模板，并保留来源',async()=>{
 const templateInfo=await inspectPresentationTemplate(await original());
 const dataDir=await fs.mkdtemp(path.resolve('.test-data/template-service-')),files=await createFileStore(dataDir),requests=[];
 const service=await createService({dataDir,fileStore:files,keys:{get:async()=> 'local-fixture'},fetchImpl:async(_url,p)=>{requests.push(JSON.parse(p.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...deck,slides:deck.slides.map((s,i)=>({...s,texts:templateInfo.pages[i].texts.map((t,n)=>({id:t.id,text:n===0?s.title:s.subtitle||s.bullets?.join('；')||'内容'}))}))})},finish_reason:'stop'}]}));}});
 try{
  const asset=await files.createDocument({buffer:await original(),name:'本机模板.pptx',scope:'agents/claude'}),template=await service.call('registerPresentationTemplate',{id:asset.id});
  assert.ok((await service.getState()).presentationTemplates.some(t=>t.id===template.id));
  const chat=await service.call('createChat',{agentIds:['claude']}),finish=async()=>{const until=Date.now()+10000;while(Date.now()<until){const c=(await service.getState()).chats.find(c=>c.id===chat.id);if(!c.running)return c;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');};
  await service.call('sendMessage',{chatId:chat.id,text:'制作两页PPT',presentationTemplate:template.id});const first=await finish();assert.equal(first.messages.at(-1).status,'complete',JSON.stringify(first.messages.at(-1)));assert.equal((await files.get(first.presentationId)).presentation.sourceTemplateId,template.id);assert.match(requests[0].messages[0].content,/恰好 2 页/);
  await service.call('sendMessage',{chatId:chat.id,text:'修改第二页标题'});const second=await finish();assert.equal(second.messages.at(-1).status,'complete');assert.equal((await files.get(second.presentationId)).presentation.sourceTemplateId,template.id);
 }finally{await service.close();}
});
