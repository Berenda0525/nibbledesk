import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MAX_FILE_BYTES,validateFileScope} from './file-store.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const formats=new Set(['docx','xlsx','pptx','odt','ods','odp','doc','xls','ppt']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.txt':'text/plain; charset=utf-8'};
const appPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' star-asset: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const officePolicy="default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const cleanName=value=>path.basename(String(value).replaceAll('\\','/')).replace(/[\u0000-\u001f<>:"|?*]/g,'_').slice(0,160);

async function readBody(request){
  if(Number(request.headers['content-length'])>MAX_FILE_BYTES)throw fail('文档超过文件大小限制',413);
  const chunks=[];let length=0;
  for await(const chunk of request){length+=chunk.length;if(length>MAX_FILE_BYTES)throw fail('文档超过文件大小限制',413);chunks.push(chunk);}
  if(!length)throw fail('保存的文档为空');
  return Buffer.concat(chunks);
}

export async function startOfficeServer({appDir,runtimeDir,files,onSaved=()=>{},bridgeDir=path.join(here,'office')}={}){
  if(!appDir||!runtimeDir||!files)throw new Error('Office 服务初始化参数不完整');
  const token=randomBytes(24).toString('hex'),prefix=`/${token}`;
  const roots={app:path.resolve(appDir),runtime:path.resolve(runtimeDir),office:path.resolve(bridgeDir)};
  const sessions=new Map();let origin;
  const headers=response=>{
    response.setHeader('Cross-Origin-Opener-Policy','same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Cache-Control','no-store');
  };
  const json=(response,status,value)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(value));};
  const publicSession=session=>({sessionId:session.id,assetId:session.assetId||null,name:session.name,kind:session.kind,revision:session.revision,isNew:!session.assetId});
  async function handle(request,response){
    headers(response);
    if(request.headers.host!==new URL(origin).host)throw fail('请求来源无效',403);
    if(request.headers.origin&&request.headers.origin!==origin)throw fail('请求来源无效',403);
    if(request.headers['sec-fetch-site']==='cross-site')throw fail('请求来源无效',403);
    if(!['GET','HEAD','POST'].includes(request.method))throw fail('不支持的请求方式',405);
    const url=new URL(request.url,origin);
    if(!url.pathname.startsWith(prefix+'/'))throw fail('页面不存在',404);
    let relative;try{relative=decodeURIComponent(url.pathname.slice(prefix.length+1));}catch{throw fail('页面地址无效');}
    if(relative.includes('\\')||relative.includes('\0')||relative.split('/').includes('..'))throw fail('页面地址无效',403);
    const [area,...segments]=relative.split('/');
    if(area==='session'){
      response.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
      const [sessionId,operation]=segments,session=sessions.get(sessionId);
      if(!session||segments.length!==2)throw fail('文档编辑会话已结束，请重新打开',404);
      if(operation==='info'&&request.method==='GET')return json(response,200,publicSession(session));
      if(operation==='document'&&request.method==='GET'){
        if(!session.assetId){response.writeHead(204);return response.end();}
        const buffer=await files.readBuffer(session.assetId);
        response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':buffer.length});return response.end(buffer);
      }
      if(operation==='save'&&request.method==='POST'){
        if(request.headers.origin!==origin)throw fail('保存请求来源无效',403);
        if(Number(request.headers['x-document-revision'])!==session.revision)throw fail('文档版本已经变化，请重新打开后保存',409);
        if(session.saving)throw fail('文档正在保存，请稍候',409);
        session.saving=true;
        try{
          const buffer=await readBody(request);
          const asset=session.assetId?await files.updateDocument(session.assetId,{buffer,revision:session.revision}):await files.createDocument({buffer,name:session.name,scope:session.scope});
          session.assetId=asset.id;session.revision=asset.revision??1;session.name=asset.name;
          await onSaved(asset);return json(response,200,{asset,session:publicSession(session)});
        }finally{session.saving=false;}
      }
      throw fail('文档操作不存在',404);
    }
    if(!roots[area]||request.method==='POST')throw fail('页面不存在',404);
    const root=roots[area],filename=path.resolve(root,segments.join('/')||'index.html');
    if(!filename.startsWith(root+path.sep))throw fail('页面地址无效',403);
    const stat=await fs.stat(filename).catch(()=>null);if(!stat?.isFile())throw fail('页面不存在',404);
    response.setHeader('Content-Security-Policy',area==='app'?appPolicy:officePolicy);
    response.writeHead(200,{'Content-Type':types[path.extname(filename).toLowerCase()]||'application/octet-stream','Content-Length':stat.size});
    if(request.method==='HEAD')return response.end();
    const stream=createReadStream(filename);stream.on('error',()=>response.destroy());stream.pipe(response);
  }
  const server=http.createServer((request,response)=>{handle(request,response).catch(error=>{if(response.headersSent)return response.destroy();headers(response);json(response,error.status||400,{error:error.status?error.message:'文档操作失败：'+String(error.message||error).slice(0,300)});});});
  server.requestTimeout=120000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {
    origin,baseURL:origin+prefix+'/',appURL:origin+prefix+'/app/index.html',
    async openSession({assetId,kind,scope,name}={}){
      if(sessions.size>=64)throw new Error('打开的文档过多，请关闭部分文档后再试');
      let asset;
      if(assetId){asset=await files.get(assetId);if(!asset)throw new Error('文档不存在');name=asset.name;kind=path.extname(name).slice(1).toLowerCase();scope=asset.scope;}
      if(!formats.has(kind))throw new Error('此文件格式不支持 Office 编辑');
      if(!asset&&!['docx','xlsx','pptx'].includes(kind))throw new Error('请选择 Word、Excel 或 PowerPoint 文档类型');
      scope=validateFileScope(scope);
      const id=randomBytes(24).toString('hex'),session={id,assetId:asset?.id,kind,name:cleanName(name||({docx:'新建文档.docx',xlsx:'新建表格.xlsx',pptx:'新建演示文稿.pptx'})[kind]),scope,revision:asset?(asset.revision??1):0};
      sessions.set(id,session);return {...publicSession(session),url:origin+prefix+'/office/index.html?session='+id};
    },
    closeSession(id){sessions.delete(id);},
    async close(){sessions.clear();server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));}
  };
}
