import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash,randomUUID} from 'node:crypto';

const root=path.resolve('resources/office-runtime');
const source='https://cdn.zetaoffice.net/zetaoffice_latest/';
await fs.mkdir(root,{recursive:true});
const files=['soffice.js','soffice.wasm','soffice.data','soffice.data.js.metadata'];
const manifest={source,retrievedAt:new Date().toISOString(),files:[]};
for(const name of files){
  const destination=path.join(root,name);let existing=false;try{await fs.access(destination);existing=true;}catch{}
  if(existing){const bytes=await fs.readFile(destination);manifest.files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});console.log(`已有 ${name} (${bytes.length} bytes)`);continue;}
  const response=await fetch(source+name,{signal:AbortSignal.timeout(600000)});if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  const temporary=destination+'.'+randomUUID()+'.part',hash=createHash('sha256');let bytes=0;
  try{
    const meter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>600*1024*1024)return callback(new Error('Runtime file exceeds expected maximum'));hash.update(chunk);callback(null,chunk);}});
    await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(temporary,{flags:'wx'}));await fs.rename(temporary,destination);
  }catch(error){await fs.rm(temporary,{force:true});throw error;}
  manifest.files.push({name,bytes,sha256:hash.digest('hex'),lastModified:response.headers.get('last-modified')});console.log(`下载 ${name} (${bytes} bytes)`);
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`运行时总大小 ${manifest.files.reduce((n,file)=>n+file.bytes,0)} bytes`);
