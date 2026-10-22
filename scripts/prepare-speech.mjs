import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';

// Optional developer setup. Audio is never uploaded by this script or decoder.
if(process.argv.length!==3||process.argv[2]!=='--accept-model-license')throw Error('先阅读 resources/speech/LICENSE-sensevoice-model.txt；同意后传入 --accept-model-license。');
if(process.platform!=='win32'||process.arch!=='x64')throw Error('此固定运行包仅适用于 Windows x64');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),speech=path.join(root,'resources/speech');
const manifest=JSON.parse(await fs.readFile(path.join(speech,'sensevoice-provenance.json'),'utf8'));
const cache=path.join(root,'.build-cache/speech-resources');await fs.mkdir(cache,{recursive:true});
async function hash(file){const result=createHash('sha256');for await(const chunk of createReadStream(file))result.update(chunk);return result.digest('hex');}
async function download(source,destination){
 try{if(await hash(destination)===source.sha256)return;throw Error('缓存校验不匹配，请先核查 '+destination);}catch(error){if(error.code!=='ENOENT')throw error;}
 const response=await fetch(source.url,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error('下载失败：'+response.status);
 let bytes=0;
 const limit=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>300*1024*1024?Error('语音资源超过大小上限'):null,chunk);}});
 await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(destination,{flags:'wx'}));
 if(await hash(destination)!==source.sha256)throw Error('语音资源 SHA-256 校验失败');
}
// Licenses ship with source. Verify them before making the model available.
for(const entry of manifest.files.filter(item=>/^(?:LICENSE|NOTICE)-/.test(item.file)))if(await hash(path.join(speech,entry.file))!==entry.sha256)throw Error('许可文件校验失败：'+entry.file);
const runtimePrefix='sherpa-onnx-v1.13.8-win-x64-shared-MT-Release-no-tts/bin/';
const modelPrefix='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/';
const sets=[
 {name:'runtime',source:manifest.runtime,files:manifest.files.filter(item=>item.file.startsWith('runtime/sensevoice/')),prefix:runtimePrefix},
 {name:'model',source:manifest.model,files:manifest.files.filter(item=>item.file.startsWith('models/sensevoice/')),prefix:modelPrefix},
];
const pending=[];
for(const set of sets){
 const archive=path.join(cache,set.name+'.tar.bz2');await download(set.source,archive);
 const extracted=await fs.mkdtemp(path.join(cache,set.name+'-'));
 // Extract exact, hash-pinned members only; never traverse arbitrary archives.
 const members=set.files.map(item=>set.prefix+path.basename(item.file));
 execFileSync('tar',['-xf',archive,'-C',extracted,...members],{windowsHide:true,stdio:'pipe'});
 for(const entry of set.files){
  const source=path.join(extracted,set.prefix,path.basename(entry.file));
  if(!(await fs.lstat(source)).isFile()||await hash(source)!==entry.sha256)throw Error('解包文件校验失败：'+entry.file);
  pending.push({source,destination:path.join(speech,entry.file),entry});
 }
}
for(const {destination,entry} of pending){
 try{if(await hash(destination)!==entry.sha256)throw Error('已有语音资源不同，请先核查：'+entry.file);}catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const {source,destination,entry} of pending){
 await fs.mkdir(path.dirname(destination),{recursive:true});
 try{await fs.copyFile(source,destination,fs.constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
 if(await hash(destination)!==entry.sha256)throw Error('安装资源校验失败：'+entry.file);
}
console.log('SenseVoice 本地语音组件已准备完成，模型许可独立于应用源码许可。');
