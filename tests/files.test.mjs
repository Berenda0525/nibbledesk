import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createFileStore,MAX_TEXT_CHARS,assertPublicImageUrl} from '../desktop/file-store.mjs';
import {createKeyStore} from '../desktop/key-store.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'star-files-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('导入后仅登记图片可预览，文本保留并可跨重启恢复',async t=>{
  const dir=await fixture(t),store=await createFileStore(dir);
  const [image,text]=await store.importData([{name:'../hello.png',base64:png.toString('base64')},{name:'note.md',base64:Buffer.from('你好\n# 星群').toString('base64')}]);
  assert.equal(image.name,'hello.png');assert.equal(image.type,'image');assert.match(image.url,/^star-asset:\/\/file\//);
  assert.equal((await store.read(image.id)).base64,png.toString('base64'));assert.equal(text.text,'你好\n# 星群');assert.equal(text.url,undefined);
  assert.equal((await (await createFileStore(dir)).list()).length,2);
  await assert.rejects(store.resolve('../../evil'),/不存在/);
});
test('导入大小、批量数、类型、文本截断有明确边界',async t=>{
  const store=await createFileStore(await fixture(t));
  await assert.rejects(store.importData(Array(9).fill({name:'a.txt',base64:'YQ=='})),/8/);
  await assert.rejects(store.importData([{name:'a.exe',base64:'YQ=='}]),/暂不支持/);
  await assert.rejects(store.importData([{name:'evil.svg',base64:Buffer.from('<svg onload="alert(1)"/>').toString('base64')}]),/暂不支持/);
  const [asset]=await store.importData([{name:'long.txt',base64:Buffer.from('a'.repeat(MAX_TEXT_CHARS+5)).toString('base64')}]);assert.equal(asset.text.length,MAX_TEXT_CHARS);assert.match(asset.warning,/截取/);
});
test('生成图片验证真实格式，并拒绝内网下载与明文链接',async t=>{
  const store=await createFileStore(await fixture(t));const result=await store.saveRemoteImage({base64:png.toString('base64')});assert.equal(result.generated,true);
  await assert.rejects(store.saveRemoteImage({base64:Buffer.from('<html>bad</html>').toString('base64')}),/不是支持的图片/);
  for(const url of ['http://example.com/a.png','https://127.0.0.1/a.png','https://10.0.0.1/a.png','https://[::1]/a.png','https://localhost/a.png'])await assert.rejects(assertPublicImageUrl(url));
});
test('密钥保存使用加密层并校验服务标识',async t=>{
  const dir=await fixture(t);const storage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from([...s].reverse().join('')),decryptString:b=>[...b.toString()].reverse().join('')};
  const store=await createKeyStore(dir,storage);await store.set('apimart','example-secret');assert.equal(await store.get('apimart'),'example-secret');assert.ok(!(await fs.readFile(path.join(dir,'credentials.json'),'utf8')).includes('example-secret'));await store.remove('apimart');assert.equal(await store.get('apimart'),'');await store.set('custom-relay','custom-fixture-only');assert.equal(await store.get('custom-relay'),'custom-fixture-only');for(const invalid of ['../escape','__proto__','constructor'])await assert.rejects(store.get(invalid));
});

test('PDF 和 DOCX 真实解析可提取文字',async t=>{
  const store=await createFileStore(await fixture(t));
  const [pdf]=await store.importPaths([createRequire(import.meta.url).resolve('pdf-parse/test/data/01-valid.pdf')]);
  assert.equal(pdf.type,'document');assert.ok(pdf.text.length>1000);
  const {default:engine}=await import('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');assert.equal(engine.PDFJS.isEvalSupported,false);assert.equal(engine.PDFJS.disableFontFace,true);
  const {default:JSZip}=await import('jszip');const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>星群文档解析测试</w:t></w:r></w:p></w:body></w:document>');
  const [docx]=await store.importData([{name:'document.docx',base64:await zip.generateAsync({type:'base64'})}]);assert.match(docx.text,/星群文档解析测试/);
});

test('损坏文档和伪装图片不会作为可执行附件进入工作台',async t=>{
  const store=await createFileStore(await fixture(t));
  for(const name of ['broken.pdf','broken.docx','fake.png','fake.jpg'])await assert.rejects(store.importData([{name,base64:Buffer.from('<script>globalThis.attachmentExecuted=true</script>').toString('base64')}]),/读取失败|暂不支持/);
  assert.equal((await store.list()).length,0);
  const html='<script>globalThis.attachmentExecuted=true</script><img src=x onerror=alert(1)>';
  const [asset]=await store.importData([{name:'恶意网页.html',base64:Buffer.from(html).toString('base64')}]);
  assert.equal(asset.type,'document');assert.equal(asset.url,undefined);assert.equal(asset.text,html);assert.equal(globalThis.attachmentExecuted,undefined);
});

test('未就绪的密钥加密器不会退回明文保存',async t=>{
  const dir=await fixture(t);const store=await createKeyStore(dir,{isEncryptionAvailable:()=>false});
  await assert.rejects(store.set('volcano','test-only-secret'),/加密暂不可用/);
  await assert.rejects(fs.readFile(path.join(dir,'credentials.json')),/ENOENT/);
});

test('停止生成会中断图片下载且不写入未完成作品',async t=>{
  const controller=new AbortController();let called=false;
  const store=await createFileStore(await fixture(t),{fetchImpl:async(_url,options)=>{called=true;assert.equal(options.signal.aborted,false);const response=new Response(new ReadableStream({start(stream){stream.enqueue(png);controller.abort(new Error('用户停止'));stream.close();}}),{status:200});return response;}});
  await assert.rejects(store.saveRemoteImage({url:'https://8.8.8.8/generated.png',signal:controller.signal}),/用户停止/);assert.equal(called,true);assert.equal((await store.list()).length,0);
});

test('DOCX 展开大小超限在解析前被拒绝',async t=>{
  const store=await createFileStore(await fixture(t));const {default:JSZip}=await import('jszip');const zip=new JSZip();zip.file('word/document.xml','small');const buffer=await zip.generateAsync({type:'nodebuffer'});let marker=buffer.indexOf(Buffer.from([80,75,1,2]));assert.ok(marker>=0);buffer.writeUInt32LE(100*1024*1024,marker+24);
  await assert.rejects(store.importData([{name:'large.docx',base64:buffer.toString('base64')}]),/展开后过大/);assert.equal((await store.list()).length,0);
});

test('Agent 和群聊附件及作品按归属目录保存，重启后仍能读取',async t=>{
  const dir=await fixture(t),store=await createFileStore(dir);
  const [document]=await store.importData([{name:'资料.txt',base64:Buffer.from('分目录资料').toString('base64')}],{scope:'agents/claude'});
  const image=await store.saveRemoteImage({base64:png.toString('base64'),scope:'groups/test-group-1'});
  assert.equal(await store.resolve(document.id),path.join(dir,'agents','claude','files',document.id));
  assert.equal(await store.resolve(image.id),path.join(dir,'groups','test-group-1','files',image.id));
  const source=path.join(dir,'source.md');await fs.writeFile(source,'原生选择文件');
  const [native]=await store.importPaths([source],{scope:'agents/gpt'});
  assert.equal(native.scope,'agents/gpt');assert.equal(await fs.readFile(await store.resolve(native.id),'utf8'),'原生选择文件');
  const reopened=await createFileStore(dir);
  assert.equal((await reopened.read(document.id)).text,'分目录资料');
  assert.equal((await reopened.read(image.id)).base64,png.toString('base64'));
  assert.equal((await reopened.get(image.id)).scope,'groups/test-group-1');
});

test('归档目录拒绝路径穿越，损坏索引不会扩展文件访问范围',async t=>{
  const dir=await fixture(t),store=await createFileStore(dir),file={name:'a.txt',base64:'YQ=='};
  for(const scope of ['../outside','agents/../../outside','groups/a/b','agents/C:','agents\\claude','C:/data','agents/']){
    await assert.rejects(store.importData([file],{scope}),/归档目录无效/);
    await assert.rejects(store.saveRemoteImage({base64:png.toString('base64'),scope}),/归档目录无效/);
  }
  assert.equal((await store.list()).length,0);
  const [asset]=await store.importData([file],{scope:'agents/kimi'});
  await fs.writeFile(path.join(dir,'files','index.json'),JSON.stringify([{...asset,scope:'../../outside'}]));
  await assert.rejects(createFileStore(dir),/文件索引读取失败/);
});
