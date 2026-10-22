import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createFileStore} from '../desktop/file-store.mjs';
import {createDocumentManager} from '../desktop/documents.mjs';
import {exportPresentationPptx} from '../core/presentations.mjs';
test('办公 PDF 预览跨重启命中，内容更新失效，拒绝越界及伪造缓存',async()=>{
 const dataDir=await fs.mkdtemp(path.resolve('.test-data/preview-cache-')),files=await createFileStore(dataDir);let sessions=0;
 const office={openSession:async()=>({sessionId:String(++sessions)})},manager=createDocumentManager({files,office,dataDir});
 const buffer=await exportPresentationPptx({title:'缓存测试',slides:[{layout:'title',title:'第一页'}]}),asset=await files.createDocument({buffer,name:'预览.pptx',scope:'agents/claude'});
 const first=await manager.open({id:asset.id});assert.equal(sessions,1);
 const pdf=(await fs.readFile(createRequire(import.meta.url).resolve('pdf-parse/test/data/01-valid.pdf'))).toString('base64');await manager.cachePreview({id:asset.id,previewKey:first.previewKey,base64:pdf});
 const restarted=createDocumentManager({files:await createFileStore(dataDir),office,dataDir}),start=performance.now(),cached=await restarted.open({id:asset.id});console.log('缓存打开耗时 ms',performance.now()-start);assert.equal(cached.base64,pdf);assert.equal(cached.previewSource,'cache');assert.equal(cached.session,undefined);assert.equal(sessions,1);
 await assert.rejects(manager.cachePreview({id:asset.id,previewKey:'../outside',base64:pdf}),/无效/);await assert.rejects(manager.cachePreview({id:asset.id,previewKey:first.previewKey,base64:Buffer.from('fake').toString('base64')}),/PDF/);
 await files.updateDocument(asset.id,{buffer:await exportPresentationPptx({title:'更新',slides:[{layout:'title',title:'更新内容'}]}),revision:1});const updated=await manager.open({id:asset.id});assert.notEqual(updated.previewKey,first.previewKey);assert.equal(sessions,2);await assert.rejects(manager.cachePreview({id:asset.id,previewKey:first.previewKey,base64:pdf}),/更新/);
});
