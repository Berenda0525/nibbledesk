import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {createFileStore} from '../desktop/file-store.mjs';
import {createDocumentManager} from '../desktop/documents.mjs';
import {exportPresentationPptx} from '../core/presentations.mjs';

const testRoot=fileURLToPath(new URL('../.test-data/documents/',import.meta.url));
async function fixture(){
  await fs.mkdir(testRoot,{recursive:true});const dataDir=await fs.mkdtemp(path.join(testRoot,'case-'));
  const files=await createFileStore(dataDir),sessions=[],saved=[];
  const manager=createDocumentManager({files,office:{openSession:async options=>{sessions.push(options);return {sessionId:`session-${sessions.length}`};}},onSaved:async asset=>{saved.push(asset);}});
  return {dataDir,files,manager,sessions,saved};
}
const upload=(name,buffer)=>({name,base64:buffer.toString('base64')});
async function docx(){
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word 中文正文</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({type:'nodebuffer'});
}
async function xlsx(){
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="业务表" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml','<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>销售额 &amp; 目标</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1200</v></c></row></sheetData></worksheet>');
  return zip.generateAsync({type:'nodebuffer'});
}
async function odf(ext){
  const zip=new JSZip(),type={odt:'text',ods:'spreadsheet',odp:'presentation'}[ext];
  zip.file('mimetype',`application/vnd.oasis.opendocument.${type}`);
  zip.file('content.xml',`<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:${type}><text:p>开放文档正文 ${ext}</text:p></office:${type}></office:body></office:document-content>`);
  return zip.generateAsync({type:'nodebuffer'});
}

test('Markdown 创建、保存、归档和重启读取保持内容与版本',async()=>{
  const {dataDir,files,manager,saved}=await fixture();
  const first=await manager.create({kind:'markdown',name:'会议记录',scope:'agents/claude'});
  assert.equal(first.kind,'markdown');assert.equal(first.name,'会议记录.md');assert.equal(first.revision,1);
  const content='# 会议记录\n\n- 决策：进入试点\n- 负责人：小王\n';
  const updated=await manager.save({id:first.id,content,revision:first.revision});
  assert.equal(updated.content,content);assert.equal(updated.revision,2);assert.equal(saved.length,2);
  assert.equal(await files.resolve(first.id),path.join(dataDir,'agents','claude','files',first.id));
  const reopened=await createFileStore(dataDir);assert.equal((await reopened.read(first.id)).text,content);assert.equal((await reopened.get(first.id)).revision,2);
});

test('两个窗口同时保存同一 Markdown 版本只接受一个结果',async()=>{
  const {manager,files}=await fixture();const initial=await manager.create({kind:'markdown',scope:'agents/gpt'});
  const results=await Promise.allSettled([manager.save({id:initial.id,revision:1,content:'# A 窗口'}),manager.save({id:initial.id,revision:1,content:'# B 窗口'})]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(results.filter(item=>item.status==='rejected').length,1);
  assert.match(results.find(item=>item.status==='rejected').reason.message,/其他窗口修改/);
  assert.equal((await files.get(initial.id)).revision,2);assert.equal((await manager.open({id:initial.id})).content,results.find(item=>item.status==='fulfilled').value.content);
});

test('文件批注独立保存、重启恢复，并拒绝旧版本覆盖',async()=>{
 const {manager,files,dataDir}=await fixture();const doc=await manager.create({kind:'markdown',name:'批注测试',scope:'agents/claude'}),before=await files.readBuffer(doc.id);
 const notes=[{id:'note-1',page:2,x:.4,y:.25,text:'请补充来源',quote:'数据说明'}];
 const result=await files.annotate(doc.id,{notes,revision:0});assert.equal(result.notesRevision,1);
 assert.deepEqual(await files.readBuffer(doc.id),before);assert.equal((await files.get(doc.id)).revision,1);
 await assert.rejects(files.annotate(doc.id,{notes:[],revision:0}),/其他窗口修改/);
 await assert.rejects(files.annotate(doc.id,{notes:[{...notes[0],x:2}],revision:1}),/位置无效/);
 const reopened=await createFileStore(dataDir);assert.deepEqual((await reopened.get(doc.id)).notes,notes);
});

test('UTF-16LE 文本编辑读取完整原文并可安全保存为 UTF-8',async()=>{
  const {files,manager}=await fixture(),original='中文会议记录\n'+'完整原文内容'.repeat(7000)+'\nEND_OF_COMPLETE_DOCUMENT';
  const bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(original,'utf16le')]);
  const [asset]=await files.importData([upload('中文笔记.md',bytes)],{scope:'agents/claude'});
  assert.ok(asset.text.length<original.length,'模型参考文本可截断，但编辑器应读取完整文件');
  const opened=await manager.open({id:asset.id});assert.equal(opened.content,original);
  const modified=original+'\n后续行动：周五复核';await manager.save({id:asset.id,content:modified,revision:opened.revision});
  assert.equal((await manager.open({id:asset.id})).content,modified);assert.equal((await files.readBuffer(asset.id)).toString('utf8'),modified);
});

test('Office 现代格式导入后提取文字并交给对应编辑会话',async()=>{
  const {files,manager,sessions}=await fixture();
  const pptx=await exportPresentationPptx({title:'中文演示',slides:[{layout:'title',title:'PPT 中文正文'}]});
  const fixtures=[['说明.docx',await docx(),'word','Word 中文正文'],['业务.xlsx',await xlsx(),'sheet','销售额 & 目标'],['演示.pptx',pptx,'presentation','PPT 中文正文'],...await Promise.all(['odt','ods','odp'].map(async ext=>[`文档.${ext}`,await odf(ext),{odt:'word',ods:'sheet',odp:'presentation'}[ext],`开放文档正文 ${ext}`]))];
  for(const [name,buffer,kind,text]of fixtures){
    const [asset]=await files.importData([upload(name,buffer)],{scope:'agents/kimi'});
    assert.match(asset.text,new RegExp(text));assert.deepEqual(await files.readBuffer(asset.id),buffer);
    const opened=await manager.open({id:asset.id});assert.equal(opened.kind,kind);assert.equal(opened.editable,true);assert.equal(sessions.at(-1).assetId,asset.id);
    await assert.rejects(manager.save({id:asset.id,content:'这不是 Office 文件',revision:1}),/保存按钮/);
  }
});

test('Office 错误容器与跨格式伪装拒绝导入且不产生附件',async()=>{
  const {files}=await fixture();
  for(const ext of ['docx','xlsx','pptx','odt','ods','odp','doc','xls','ppt'])await assert.rejects(files.importData([upload(`坏文档.${ext}`,Buffer.from('not an Office document'))]));
  await assert.rejects(files.importData([upload('改错扩展名.pptx',await xlsx())]),/幻灯片/);
  await assert.rejects(files.importData([upload('改错扩展名.xlsx',await docx())]),/工作表/);
  assert.equal((await files.list()).length,0);
});

test('Excel 提取按工作簿显示顺序保留工作表名称和数据',async()=>{
  const {files}=await fixture(),zip=await JSZip.loadAsync(await xlsx());
  zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="先看计划" sheetId="2" r:id="rId2"/><sheet name="再看 &amp; 实绩" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet2.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>优先查看的计划数据</t></is></c></row></sheetData></worksheet>');
  zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace('</Types>','<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
  const [asset]=await files.importData([upload('工作表重排.xlsx',await zip.generateAsync({type:'nodebuffer'}))],{scope:'agents/deepseek'});
  assert.match(asset.text,/工作表 先看计划[\s\S]*优先查看的计划数据[\s\S]*工作表 再看 & 实绩[\s\S]*销售额 & 目标/);
});

test('只有 OLE 文件头的截断旧 Office 文件必须被拒绝',async()=>{
  const {files}=await fixture(),header=Buffer.from([208,207,17,224,161,177,26,225]);
  for(const ext of ['doc','xls','ppt'])await assert.rejects(files.importData([upload(`截断文档.${ext}`,header)]),/格式|损坏|完整|读取/);
  assert.equal((await files.list()).length,0);
});

test('新建文档归档与编辑类型有明确边界',async()=>{
  const {manager,files,sessions}=await fixture();
  for(const kind of ['word','sheet','presentation']){
    const opened=await manager.create({kind,name:'项目交付',scope:'groups/project-test'});
    assert.equal(opened.kind,kind);assert.equal(opened.editable,true);assert.equal(sessions.at(-1).scope,'groups/project-test');
  }
  assert.equal((await files.list()).length,0,'Office 新文档保存前不应产生空交付文件');
  await assert.rejects(manager.create({kind:'markdown',scope:'../outside'}),/归档目录无效/);
  await assert.rejects(manager.create({kind:'markdown'}),/文件夹/);
  await assert.rejects(manager.create({kind:'html',scope:'agents/kimi'}),/文档/);
});
