import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {extractOfficeText} from './office-text.mjs';
import {writeAtomic,renameAtomic} from '../core/atomic-file.mjs';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_CHARS = 40000;
const TEXT_EXTENSIONS = new Set(['.txt','.md','.markdown','.csv','.json','.jsonl','.js','.mjs','.cjs','.jsx','.ts','.tsx','.py','.css','.html','.xml','.yaml','.yml','.sql','.log','.ini','.toml','.java','.c','.cpp','.h','.sh','.ps1','.bat','.srt','.vtt']);
const IMAGE_MIMES = new Set(['image/png','image/jpeg','image/webp','image/gif']);
const cleanName = name => path.basename(String(name || '文件').replaceAll('\\','/')).replace(/[\u0000-\u001f<>:"|?*]/g,'_').slice(0,160) || '文件';

export function validateFileScope(scope){
  if(scope===undefined||scope===null)return undefined;
  if(typeof scope!=='string'||! /^(agents|groups)\/[A-Za-z0-9_-]{1,80}$/.test(scope))throw new Error('文件归档目录无效');
  return scope;
}

export function imageMime(buffer) {
  if(buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(buffer.length >= 3 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255) return 'image/jpeg';
  if(buffer.length >= 12 && buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP') return 'image/webp';
  if(buffer.length >= 6 && ['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6))) return 'image/gif';
  return null;
}

function decodeBase64(value) {
  if(typeof value !== 'string' || !value.length) throw new Error('文件内容为空');
  const raw=value.replace(/^data:[^,]*;base64,/,'').replace(/\s/g,'');
  if(raw.length > Math.ceil(MAX_FILE_BYTES/3)*4+4) throw new Error('单个文件不能超过 20 MB');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length%4===1) throw new Error('文件编码无效');
  const buffer=Buffer.from(raw,'base64');
  if(buffer.length>MAX_FILE_BYTES) throw new Error('单个文件不能超过 20 MB');
  return buffer;
}

function privateAddress(address) {
  let a=address.toLowerCase().replace(/^::ffff:/,'');
  if(isIP(a)===4){
    const n=a.split('.').map(Number);
    return n[0]===0 || n[0]===10 || n[0]===127 || n[0]>=224 || (n[0]===169&&n[1]===254) || (n[0]===172&&n[1]>=16&&n[1]<=31) || (n[0]===192&&n[1]===168) || (n[0]===100&&n[1]>=64&&n[1]<=127) || (n[0]===198&&(n[1]===18||n[1]===19));
  }
  return a==='::' || a==='::1' || a.startsWith('fc') || a.startsWith('fd') || /^fe[89ab]/.test(a);
}

export async function assertPublicImageUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error('图片下载地址无效'); }
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443')) throw new Error('图片下载仅支持标准 HTTPS 地址');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('图片地址不能指向本机或局域网');
  const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true});
  if(!addresses.length || addresses.some(item=>privateAddress(item.address))) throw new Error('图片地址不能指向本机或局域网');
  return url;
}

async function fetchImage(value,fetchImpl,signal) {
  let current=value;
  for(let redirect=0;redirect<=3;redirect++){
    signal?.throwIfAborted();
    const url=await assertPublicImageUrl(current);
    const timeout=AbortSignal.timeout(60000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
    const response=await fetchImpl(url,{redirect:'manual',signal:combined});
    if([301,302,303,307,308].includes(response.status)){
      if(redirect===3) throw new Error('图片下载重定向过多');
      current=new URL(response.headers.get('location'),url).href; continue;
    }
    if(!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`);
    if(Number(response.headers.get('content-length'))>MAX_FILE_BYTES) throw new Error('生成图片超过 20 MB，无法保存');
    const chunks=[]; let size=0;
    for await(const chunk of response.body){ combined.throwIfAborted();size+=chunk.length; if(size>MAX_FILE_BYTES) throw new Error('生成图片超过 20 MB，无法保存'); chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks);
  }
  throw new Error('图片下载失败');
}

async function extractText(buffer,name){
  const ext=path.extname(name).toLowerCase();
  let text='',warning;
  if(TEXT_EXTENSIONS.has(ext)){
    text=buffer[0]===255&&buffer[1]===254?buffer.subarray(2).toString('utf16le'):buffer.toString('utf8').replace(/^\uFEFF/,'');
    if(text.includes('\u0000')) throw new Error('这个文件不是可读取的文本文件');
    if(text.includes('\uFFFD')) warning='文件包含无法识别的文字编码，建议转换为 UTF-8 后重新上传。';
  } else if(ext==='.pdf'){
    if(!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('PDF 读取失败，请确认文件格式正确');
    try {
      const {default:engine}=await import('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
      engine.PDFJS.isEvalSupported=false;engine.PDFJS.disableFontFace=true;
      const {default:parse}=await import('pdf-parse/lib/pdf-parse.js');const result=await parse(buffer,{max:200});text=result.text;
      if(result.numpages>200)warning='PDF 已提取前 200 页，原文件完整保留。';
    }
    catch { throw new Error('PDF 读取失败，请确认文件未损坏或加密'); }
    if(!text.trim()) warning='此 PDF 未提取到文字，可能是扫描件。请上传页面图片或先进行文字识别。';
  } else if(ext==='.docx'){
    if(buffer.length<4||buffer[0]!==80||buffer[1]!==75)throw new Error('Word 文档读取失败，请使用有效的 .docx 文件');
    validateDocxContainer(buffer);
    try { const {default:mammoth}=await import('mammoth'); const result=await mammoth.extractRawText({buffer}); text=result.value; if(result.messages.length) warning='文档中部分特殊内容可能未提取，请核对原文件。'; }
    catch { throw new Error('Word 文档读取失败，请使用有效的 .docx 文件'); }
  } else if(['.pptx','.xlsx','.odt','.ods','.odp'].includes(ext)){
    text=await extractOfficeText(buffer,ext);
  } else if(['.doc','.xls','.ppt'].includes(ext)){
    const validHeader=buffer.length>=512&&buffer.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]))&&buffer.readUInt16LE(28)===0xfffe;
    const major=validHeader?buffer.readUInt16LE(26):0,sector=validHeader?buffer.readUInt16LE(30):0;
    if(!validHeader||!((major===3&&sector===9)||(major===4&&sector===12))||buffer.length<(2**sector)*2)throw new Error('Office 文档格式无效或不完整');
    warning='原文件已保留，可在文档编辑器中打开；发给 AI 前请另存为 DOCX、XLSX 或 PPTX。';
  } else throw new Error(`暂不支持 ${ext||'无扩展名'} 文件。支持图片、PDF、Office 文档、文本和代码文件。`);
  if(text.length>MAX_TEXT_CHARS){ text=text.slice(0,MAX_TEXT_CHARS); warning=[warning,`文本已截取前 ${MAX_TEXT_CHARS.toLocaleString()} 个字符，原文件完整保留。`].filter(Boolean).join(' '); }
  return {text,warning};
}

function validateDocxContainer(buffer){
  const footer=buffer.lastIndexOf(Buffer.from([80,75,5,6]));
  if(footer<0||footer+22>buffer.length)throw new Error('Word 文档读取失败，压缩容器不完整');
  const count=buffer.readUInt16LE(footer+10),start=buffer.readUInt32LE(footer+16);let offset=start,total=0;
  if(count>10000||count===65535||start===0xffffffff)throw new Error('Word 文档结构过大，请拆分后上传');
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Word 文档读取失败，压缩目录无效');
    const size=buffer.readUInt32LE(offset+24);total+=size;
    if(size>32*1024*1024||total>64*1024*1024)throw new Error('Word 文档展开后过大，请拆分后上传');
    offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
}

export async function createFileStore(dataDir,{fetchImpl=fetch}={}){
  dataDir=path.resolve(dataDir);
  const root=path.join(dataDir,'files'); await fs.mkdir(root,{recursive:true});
  const indexPath=path.join(root,'index.json');
  let items=[]; try { const parsed=JSON.parse(await fs.readFile(indexPath,'utf8')); if(Array.isArray(parsed)) items=parsed.filter(x=>typeof x.id==='string'&&/^[a-f0-9-]{36}$/.test(x.id)&&typeof x.name==='string').map(item=>{validateFileScope(item.scope);return item;}); } catch(error){ if(error.code!=='ENOENT') throw new Error('文件索引读取失败，请保留数据目录并联系维护人员'); }
  let queue=Promise.resolve();const edits=new Map();
  const persist=()=>{ const json=JSON.stringify(items,null,2); queue=queue.catch(()=>{}).then(()=>writeAtomic(indexPath,json,'utf8')); return queue; };
  const get=id=>items.find(item=>item.id===id);
  const directoryFor=scope=>scope?path.join(dataDir,validateFileScope(scope),'files'):root;
  const resolve=id=>{const item=get(id);if(!item) throw new Error('文件不存在');return path.join(directoryFor(item.scope),id);};
  async function importBuffer(buffer,name,{generated=false,scope,signal}={}){
    scope=validateFileScope(scope);
    if(!buffer.length) throw new Error('不能上传空文件');
    if(buffer.length>MAX_FILE_BYTES) throw new Error('单个文件不能超过 20 MB');
    let safeName=cleanName(name);const mime=imageMime(buffer),id=randomUUID();
    if(generated&&!mime) throw new Error('平台返回的内容不是支持的图片格式');
    if(generated){const extension={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[mime];safeName=safeName.replace(/\.[^.]+$/,'')+extension;}
    const content=mime?{}:await extractText(buffer,safeName);
    const asset={id,name:safeName,type:mime?'image':'document',mime:mime||'application/octet-stream',size:buffer.length,createdAt:new Date().toISOString(),revision:1,...content};
    if(mime)asset.url=`star-asset://file/${id}`;
    if(generated)asset.generated=true;
    if(scope)asset.scope=scope;
    const directory=directoryFor(scope);await fs.mkdir(directory,{recursive:true});
    signal?.throwIfAborted();await fs.writeFile(path.join(directory,id),buffer,{flag:'wx'});items.push(asset);await persist();return {...asset};
  }
  const checkCount=arr=>{if(!Array.isArray(arr)||arr.length<1||arr.length>8)throw new Error('每次可上传 1 至 8 个文件');};
  return {
    async createArtifact({buffer,name,scope,signal}){
      buffer=Buffer.from(buffer);scope=validateFileScope(scope);
      if(!buffer.length||buffer.length>MAX_FILE_BYTES)throw new Error('交付文件为空或超过 20 MB');
      try{return await importBuffer(buffer,name,{scope,signal});}catch(error){if(!String(error.message).startsWith('暂不支持 '))throw error;}
      signal?.throwIfAborted();const id=randomUUID(),directory=directoryFor(scope);await fs.mkdir(directory,{recursive:true});
      const asset={id,name:cleanName(name),type:'document',mime:'application/octet-stream',size:buffer.length,createdAt:new Date().toISOString(),revision:1,scope,warning:'此文件可下载保存；应用内暂不支持预览。'};
      await fs.writeFile(path.join(directory,id),buffer,{flag:'wx'});items.push(asset);await persist();return {...asset};
    },
    async createDocument({buffer,name,scope,metadata={},signal}){const asset=await importBuffer(Buffer.from(buffer),name,{scope,signal});const item=get(asset.id);if(metadata.presentation)item.presentation=metadata.presentation;await persist();return {...item};},
    async readBuffer(id){return fs.readFile(resolve(id));},
    async annotate(id,{notes,revision=0}){
      const asset=get(id);if(!asset)throw new Error('文件不存在');
      if(!Array.isArray(notes)||notes.length>300)throw new Error('批注数量超过上限');
      const clean=notes.map(note=>{
        if(!note||typeof note.id!=='string'||note.id.length>80||typeof note.text!=='string'||note.text.length>4000)throw new Error('批注格式无效');
        const page=Number(note.page)||0;if(!Number.isInteger(page)||page<0||page>10000)throw new Error('批注页码无效');
        const point={};for(const key of ['x','y'])if(note[key]!==undefined){if(!Number.isFinite(note[key])||note[key]<0||note[key]>1)throw new Error('批注位置无效');point[key]=note[key];}
        return {id:note.id,text:note.text,page,quote:String(note.quote||'').slice(0,2000),...point};
      });
      // 批注独立于正文版本保存；并发写入仍采用明确版本检查。
      const task=(edits.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
        if(revision!==(asset.notesRevision??0))throw new Error('批注已被其他窗口修改，请重新打开文件');
        asset.notes=clean;asset.notesRevision=(asset.notesRevision??0)+1;await persist();return {notes:structuredClone(clean),notesRevision:asset.notesRevision};
      });edits.set(id,task);return task;
    },
    async updateDocument(id,{buffer,revision,metadata={}}){
      const task=(edits.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const asset=get(id);if(!asset)throw new Error('文件不存在');
      if(revision!==undefined&&revision!==(asset.revision??1))throw new Error('文件已被其他窗口修改，请重新打开后再保存');
      buffer=Buffer.from(buffer);if(!buffer.length||buffer.length>MAX_FILE_BYTES)throw new Error('保存内容为空或超过 20 MB');
      const content=asset.type==='image'?{}:await extractText(buffer,asset.name);
      const target=resolve(id),temp=target+'.edit-'+randomUUID();await fs.writeFile(temp,buffer,{flag:'wx'});
      // Recheck after parsing, so concurrent editor saves cannot overwrite a newer revision.
      if(revision!==undefined&&revision!==(asset.revision??1)){await fs.unlink(temp);throw new Error('文件已被其他窗口修改，请重新打开后再保存');}
      await renameAtomic(temp,target);Object.assign(asset,content,{size:buffer.length,revision:(asset.revision??1)+1,updatedAt:new Date().toISOString()});
      if(metadata.presentation)asset.presentation=metadata.presentation;else if(asset.presentation)asset.presentation={...asset.presentation,manuallyEdited:true};
      await persist();return {...asset};
      });edits.set(id,task);return task;
    },
    async importPaths(paths,{scope}={}){scope=validateFileScope(scope);checkCount(paths);const prepared=[];for(const file of paths){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_FILE_BYTES)throw new Error('请选择小于 20 MB 的普通文件');prepared.push([await fs.readFile(file),path.basename(file)]);}const result=[];for(const [buffer,name] of prepared)result.push(await importBuffer(buffer,name,{scope}));return result;},
    async importData(files,{scope}={}){scope=validateFileScope(scope);checkCount(files);const prepared=files.map(file=>[decodeBase64(file.base64),file.name]);const result=[];for(const [buffer,name] of prepared)result.push(await importBuffer(buffer,name,{scope}));return result;},
    async saveRemoteImage({url,base64,mime,name,signal,scope}={}){scope=validateFileScope(scope);signal?.throwIfAborted();const buffer=base64?decodeBase64(base64):await fetchImage(url,fetchImpl,signal);signal?.throwIfAborted();const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[imageMime(buffer)]||'.png';return importBuffer(buffer,name||`作品-${Date.now()}${ext}`,{generated:true,scope,signal});},
    async get(id){const asset=get(id);return asset?{...asset}:null;},
    async list(){return items.map(item=>({...item}));},
    async resolve(id){return resolve(id);},
    async read(id){const asset=get(id);if(!asset)throw new Error('文件不存在');return {...asset,...(asset.type==='image'?{base64:(await fs.readFile(resolve(id))).toString('base64')}:{})};}
  };
}
