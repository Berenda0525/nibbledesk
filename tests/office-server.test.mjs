import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startOfficeServer} from '../desktop/office-server.mjs';

const root=fileURLToPath(new URL('../.test-data/office-server/',import.meta.url));
async function fixture(t){
  await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'case-'));
  for(const name of ['app','runtime','office'])await fs.mkdir(path.join(dir,name));
  await fs.writeFile(path.join(dir,'app','index.html'),'<h1>工作区</h1>');
  await fs.writeFile(path.join(dir,'outside.txt'),'private');
  const assets=new Map(),buffers=new Map(),saved=[];
  const files={
    async get(id){return assets.get(id);},
    async readBuffer(id){return buffers.get(id);},
    async createDocument({buffer,name,scope}){const asset={id:randomUUID(),name,scope,revision:1};assets.set(asset.id,asset);buffers.set(asset.id,buffer);return {...asset};},
    async updateDocument(id,{buffer,revision}){const old=assets.get(id);if(revision!==(old.revision??1))throw new Error('文件已被其他窗口修改，请重新打开后再保存');const asset={...old,revision:revision+1};assets.set(id,asset);buffers.set(id,buffer);return {...asset};}
  };
  const server=await startOfficeServer({appDir:path.join(dir,'app'),runtimeDir:path.join(dir,'runtime'),bridgeDir:path.join(dir,'office'),files,onSaved:asset=>saved.push(asset)});
  t.after(()=>server.close());return {server,assets,buffers,saved};
}
const rawRequest=(url,headers={})=>new Promise((resolve,reject)=>{const value=new URL(url);const request=http.request({hostname:value.hostname,port:value.port,path:value.pathname,method:'GET',headers},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));});request.on('error',reject);request.end();});
const sessionURL=(server,session,operation)=>`${server.baseURL}session/${session.sessionId}/${operation}`;
const save=(server,session,body,revision=session.revision)=>fetch(sessionURL(server,session,'save'),{method:'POST',headers:{Origin:server.origin,'X-Document-Revision':String(revision),'Content-Type':'application/octet-stream'},body});

test('本地办公服务要求秘密路径、合法 Host 与同源请求，页面启用隔离',async t=>{
  const {server}=await fixture(t);
  const response=await fetch(server.appURL);assert.equal(response.status,200);assert.match(await response.text(),/工作区/);
  assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal((await fetch(server.origin+'/app/index.html')).status,404);
  assert.equal((await fetch(server.appURL,{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(server.appURL,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await rawRequest(server.appURL,{Host:'localhost'})).status,403);
  for(const relative of ['app/%2e%2e%2foutside.txt','app/%5c..%5coutside.txt','app/%00index.html']){
    const denied=await rawRequest(server.baseURL+relative);assert.equal(denied.status,403);assert.ok(!denied.body.includes('private'));
  }
});

test('新建、保存、读取、重开保持同一文件和递增版本，旧版本不能覆盖',async t=>{
  const {server,assets,buffers,saved}=await fixture(t);
  const first=await server.openSession({kind:'docx',scope:'agents/claude'});
  assert.equal(first.revision,0);assert.equal((await fetch(sessionURL(server,first,'document'))).status,204);
  assert.equal((await fetch(sessionURL(server,first,'save'),{method:'POST',headers:{'X-Document-Revision':'0'},body:'no-origin'})).status,403);
  const created=await (await save(server,first,'first-document')).json();assert.equal(created.asset.revision,1);assert.equal(created.asset.scope,'agents/claude');assert.equal(saved.length,1);
  const reopened=await server.openSession({assetId:created.asset.id});assert.equal(reopened.assetId,created.asset.id);assert.equal(reopened.revision,1);
  assert.equal(await (await fetch(sessionURL(server,reopened,'document'))).text(),'first-document');
  const second=await (await save(server,reopened,'edited-document')).json();assert.equal(second.asset.revision,2);assert.equal(second.asset.id,created.asset.id);
  assert.equal((await save(server,reopened,'stale',1)).status,409);
  const other=await save(server,first,'other-window',1);assert.ok(other.status>=400);assert.match((await other.json()).error,/其他窗口修改|版本/);
  assert.equal(buffers.get(created.asset.id).toString(),'edited-document');assert.equal(assets.size,1);
  server.closeSession(reopened.sessionId);assert.equal((await fetch(sessionURL(server,reopened,'info'))).status,404);
});

test('旧文件无 revision 时使用第一版，限定文档类型和归档目录',async t=>{
  const {server,assets,buffers}=await fixture(t);const id=randomUUID();assets.set(id,{id,name:'旧文件.docx',scope:'groups/group1'});buffers.set(id,Buffer.from('old'));
  const session=await server.openSession({assetId:id});assert.equal(session.revision,1);
  const result=await (await save(server,session,'updated')).json();assert.equal(result.asset.revision,2);
  await assert.rejects(server.openSession({kind:'html',scope:'agents/gpt'}),/不支持/);
  await assert.rejects(server.openSession({kind:'docx',scope:'../../secret'}),/目录/);
  await assert.rejects(server.openSession({assetId:randomUUID()}),/不存在/);
  const empty=await server.openSession({kind:'xlsx',scope:'agents/gpt'});assert.equal((await save(server,empty,'')).status,400);
});
