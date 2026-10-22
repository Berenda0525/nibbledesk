import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(!args.length||args.some(a=>!['--node','--folia'].includes(a)))throw Error('请选择 --node 或 --folia');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function download(url,expected,maxBytes){
 const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
 if(!response.ok)throw Error(`下载失败：HTTP ${response.status}`);
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw Error('资源超过大小限制');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);if(hash(bytes)!==expected.toLowerCase())throw Error('SHA-256 不符，请核查上游与来源记录');return bytes;
}
if(args.includes('--node')){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('当前任务运行组件针对 Windows x64');
 const dir=path.join(root,'resources/runtime'),manifest=JSON.parse(await fs.readFile(path.join(dir,'node-provenance.json'),'utf8'));
 const target=path.join(dir,'node.exe');let ready=false;
 try{ready=hash(await fs.readFile(target))===manifest.sha256;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!ready){
  const bytes=await download(manifest.source,manifest.sha256,100*1024*1024);
  const temporary=target+'.'+randomUUID()+'.part';await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,target);
 }
 console.log('任务 Node.js 运行时已校验：'+manifest.version);
}
if(args.includes('--folia')){
 const commit='f3a90708afbec884934d8bca16bbd0a35feeb6a7',expected='7559b6cf3e16aff1114b23dbd1bf1df2c904c75095146aa220620404f1405599';
 const cache=path.join(root,'.build-cache'),target=path.join(cache,'folia-major-source');
 try{await fs.access(target);throw Error('Folia 源码目录已存在，请先核查现有版本');}catch(e){if(e.code!=='ENOENT')throw e;}
 const bytes=await download(`https://codeload.github.com/chthollyphile/folia-major/zip/${commit}`,expected,80*1024*1024);
 const zip=await JSZip.loadAsync(bytes),prefix=`folia-major-${commit}/`;
 const entries=Object.values(zip.files);let total=0;
 for(const entry of entries){
  const original=entry.unsafeOriginalName??entry.name;
  if(!original.startsWith(prefix)||original.includes('\\')||original.split('/').includes('..')||(Number(entry.unixPermissions)>>12)===10)throw Error('上游压缩包包含不安全路径');
 }
 await fs.mkdir(cache,{recursive:true});
 await fs.writeFile(path.join(cache,`folia-${commit}.zip`),bytes,{flag:'wx'});
 for(const entry of entries){
  const rel=entry.name.slice(prefix.length);if(!rel)continue;const output=path.join(target,rel);
  if(entry.dir){await fs.mkdir(output,{recursive:true});continue;}
  const data=await entry.async('nodebuffer');total+=data.length;if(total>300*1024*1024)throw Error('解压资源超过大小限制');
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,data,{flag:'wx'});
 }
 await fs.copyFile(path.join(cache,`folia-${commit}.zip`),path.join(root,'resources/folia-source',`folia-major-${commit.slice(0,8)}.zip`));
 console.log('Folia 固定源码已校验并准备：'+commit);
}
