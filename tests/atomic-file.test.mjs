import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFileStore} from '../desktop/file-store.mjs';
import {createKeyStore} from '../desktop/key-store.mjs';
import {createService} from '../core/service.mjs';

async function fixture(){await fs.mkdir('.test-data',{recursive:true});return fs.mkdtemp(path.resolve('.test-data/atomic-'));}
const ioError=code=>Object.assign(new Error('Injected local filesystem failure'),{code});
const storage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().slice(10)};

test('原子写入正常替换现有文件',async()=>{
  const {writeAtomic}=await import('../core/atomic-file.mjs');
  const file=path.join(await fixture(),'value.json');await fs.writeFile(file,'old');
  await writeAtomic(file,'new','utf8');assert.equal(await fs.readFile(file,'utf8'),'new');
});

test('短暂 EPERM EBUSY EACCES 解除后原子替换成功',async t=>{
  const {writeAtomic}=await import('../core/atomic-file.mjs');
  const file=path.join(await fixture(),'value.json');await fs.writeFile(file,'old');
  const rename=fs.rename;let calls=0;
  t.mock.method(fs,'rename',async(...args)=>{const code=['EPERM','EBUSY','EACCES'][calls++];if(code)throw ioError(code);return rename(...args);});
  await writeAtomic(file,'new','utf8');assert.equal(calls,4);assert.equal(await fs.readFile(file,'utf8'),'new');
});

test('持续占用时次数与等待有界并保留原文件和待写副本',async t=>{
  const {writeAtomic}=await import('../core/atomic-file.mjs');
  const file=path.join(await fixture(),'value.json');await fs.writeFile(file,'original');let calls=0;
  const failure=ioError('EPERM');t.mock.method(fs,'rename',async()=>{calls++;throw failure;});
  const began=performance.now();await assert.rejects(writeAtomic(file,'pending','utf8'),error=>error===failure);
  assert.ok(calls>=2&&calls<=7);assert.ok(performance.now()-began<1500);
  assert.equal(await fs.readFile(file,'utf8'),'original');assert.equal(await fs.readFile(file+'.tmp','utf8'),'pending');
});

test('其他文件错误立即返回且不重试',async t=>{
  const {writeAtomic}=await import('../core/atomic-file.mjs');
  const file=path.join(await fixture(),'value.json');await fs.writeFile(file,'original');let calls=0;
  const failure=ioError('ENOSPC');t.mock.method(fs,'rename',async()=>{calls++;throw failure;});
  await assert.rejects(writeAtomic(file,'pending','utf8'),error=>error===failure);assert.equal(calls,1);
  assert.equal(await fs.readFile(file,'utf8'),'original');
});

test('文件索引保存队列在一次拒绝后可处理后续请求',async t=>{
  const dir=await fixture(),store=await createFileStore(dir),target=path.join(dir,'files','index.json');
  const rename=fs.rename;let failed=false;
  t.mock.method(fs,'rename',async(...args)=>{if(args[1]===target&&!failed){failed=true;throw ioError('EIO');}return rename(...args);});
  await assert.rejects(store.importData([{name:'first.txt',base64:'Zmlyc3Q='}]),{code:'EIO'});
  const [saved]=await store.importData([{name:'second.txt',base64:'c2Vjb25k'}]);
  const reopened=await createFileStore(dir);assert.equal((await reopened.read(saved.id)).text,'second');
});

test('密钥保存队列在一次拒绝后可处理后续请求',async t=>{
  const dir=await fixture(),store=await createKeyStore(dir,storage),target=path.join(dir,'credentials.json');
  const rename=fs.rename;let failed=false;
  t.mock.method(fs,'rename',async(...args)=>{if(args[1]===target&&!failed){failed=true;throw ioError('EIO');}return rename(...args);});
  await assert.rejects(store.set('apimart','fake-first'),{code:'EIO'});
  await store.set('apimart','fake-second');assert.equal(await (await createKeyStore(dir,storage)).get('apimart'),'fake-second');
});

test('文档替换遇到短暂占用可恢复并仅递增一次版本',async t=>{
  const dir=await fixture(),store=await createFileStore(dir),asset=await store.createDocument({buffer:Buffer.from('before'),name:'document.txt'});
  const target=await store.resolve(asset.id),rename=fs.rename;let blocked=0;
  t.mock.method(fs,'rename',async(...args)=>{if(args[1]===target&&blocked++<2)throw ioError('EPERM');return rename(...args);});
  const updated=await store.updateDocument(asset.id,{buffer:Buffer.from('after'),revision:1});
  assert.equal(updated.revision,2);assert.equal((await store.readBuffer(asset.id)).toString(),'after');
});

test('聊天服务配置保存使用同一短暂占用恢复策略',async t=>{
  const dir=await fixture(),files=await createFileStore(dir),keys={get:async()=>''};
  const service=await createService({dataDir:dir,keys,fileStore:files});t.after(()=>service.close());
  const rename=fs.rename;let blocked=false;
  t.mock.method(fs,'rename',async(...args)=>{if(path.basename(args[1])==='profile.json'&&!blocked){blocked=true;throw ioError('EBUSY');}return rename(...args);});
  await service.call('updateProfile',{displayName:'atomic-test'});assert.equal((await service.getState()).profile.displayName,'atomic-test');
});
