import {createNeteaseRuntime,musicEndpoint} from './netease.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {writeAtomic} from '../../../core/atomic-file.mjs';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
/** Folia 只取得独立音乐网页及浏览器存储，不接触聊天 IPC 或模型密钥。 */
export async function startMusicServer({root,dataDir,parentOrigin}){
 root=path.resolve(root);const html=await fs.readFile(path.join(root,'index.html'),'utf8');
 const inlineHashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(m=>m[1].trim()).map(m=>`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
 const directory=path.join(dataDir,'modules/music');await fs.mkdir(directory,{recursive:true});
 const stateFile=path.join(directory,'origin.json');let saved={};try{saved=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('音乐模块的本地配置无法读取');}
 const netease=createNeteaseRuntime({dataDir});void netease.prepare().catch(()=>{});
 const token=randomBytes(32).toString('hex'),cookie='guagua_folia_session';let origin;
 const server=http.createServer((request,response)=>{(async()=>{
  response.setHeader('Cross-Origin-Resource-Policy','cross-origin');response.setHeader('Cross-Origin-Embedder-Policy','credentialless');response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Cache-Control','no-store');
  response.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${inlineHashes}; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob: data:; font-src 'self' https: data:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors ${parentOrigin}`);
  if(request.headers.host!==new URL(origin).host||!['GET','HEAD','POST'].includes(request.method)||request.headers['sec-fetch-site']==='cross-site'||request.headers.origin&&request.headers.origin!==origin){response.writeHead(403);response.end();return;}
  const url=new URL(request.url,origin),bootstrap=url.pathname==='/'&&url.searchParams.get('access')===token;
  const authorized=(request.headers.cookie||'').split(';').some(v=>v.trim()===cookie+'='+token);
  if(!bootstrap&&!authorized){response.writeHead(403);response.end();return;}
  if(bootstrap){response.setHeader('Set-Cookie',`${cookie}=${token}; HttpOnly; SameSite=Strict; Path=/`);response.writeHead(302,{Location:'/'});response.end();return;}
  if(url.pathname.startsWith('/netease-api/')){
    if(!['GET','POST'].includes(request.method)){response.writeHead(405).end();return;}
    if(request.headers.origin!==origin&&request.headers['sec-fetch-site']!=='same-origin'){response.writeHead(403).end();return;}const route=url.pathname.slice('/netease-api'.length);if(!musicEndpoint(route)){response.writeHead(404).end();return;}let raw='';for await(const chunk of request){raw+=chunk;if(Buffer.byteLength(raw)>65536){response.writeHead(413).end();return;}}const params=Object.fromEntries(url.searchParams);if(raw){let body;try{body=request.headers['content-type']?.includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));}catch{response.writeHead(400).end();return;}if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>['__proto__','constructor','prototype'].includes(k))){response.writeHead(400).end();return;}Object.assign(params,body);}try{const result=await netease.request(route,params);const json=JSON.stringify(result.body);if(Buffer.byteLength(json)>8*1024*1024)throw Error('音乐响应超出大小限制');response.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8'});response.end(json);}catch(e){response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({code:502,message:e.message}));}return;
  }
  if(request.method==='POST'){response.writeHead(405).end();return;}
  if(url.pathname==='/runtime-config.js'){
    const script=`window.__FOLIA_RUNTIME_CONFIG__={};if(!localStorage.getItem('guagua_music_initialized_v1')){const defaults={library_suite:'grid',playback_entry_view:'stay',playback_entry_view_chosen:'true',library_suite_prompt_seen:'true',folia_last_seen_guide_version:'0.7.21',folia_last_seen_ponder_onboarding_version:'0.7.21'};for(const [key,value]of Object.entries(defaults))if(localStorage.getItem(key)===null)localStorage.setItem(key,value);localStorage.setItem('guagua_music_initialized_v1','true');}`;
    response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});response.end(request.method==='HEAD'?'':script);return;
  }
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{response.writeHead(400);response.end();return;}
  if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').includes('..')){response.writeHead(403);response.end();return;}
  let file=path.resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
  if(!path.extname(pathname))file=path.join(root,'index.html');
  const stat=await fs.stat(file).catch(()=>null);if(!stat?.isFile()){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size});if(request.method==='HEAD'){response.end();return;}
  createReadStream(file).on('error',()=>response.destroy()).pipe(response);
 })().catch(()=>{if(!response.headersSent)response.writeHead(500);response.end();});});
 server.headersTimeout=15000;server.requestTimeout=30000;
 const port=Number.isInteger(saved.port)&&saved.port>1024&&saved.port<65536?saved.port:0;
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(e){throw new Error(e.code==='EADDRINUSE'?'音乐模块的固定端口被其他程序占用，请关闭占用程序后重试。':'音乐模块启动失败');}
 origin=`http://127.0.0.1:${server.address().port}`;
 try{await writeAtomic(stateFile,JSON.stringify({port:server.address().port}),'utf8');}catch(e){server.close();throw e;}
 return {url:origin+'/?access='+token,origin,async close(){await netease.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
