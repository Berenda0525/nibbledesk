import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {decodeSpeechWav,createSpeechEngine} from '../desktop/speech.mjs';
function wav(seconds=1,amplitude=1000){const b=Buffer.alloc(44+seconds*32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let i=44;i<b.length;i+=2)b.writeInt16LE(amplitude*Math.sin(i),i);return b;}
// Mocked process tests need resource-presence fixtures, not a real model or executable.
async function speechResources(){
 await fs.mkdir('.test-data',{recursive:true});const root=await fs.mkdtemp(path.resolve('.test-data/speech-resources-'));
 for(const relative of ['runtime/Release/whisper-cli.exe','models/ggml-base.bin']){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'test fixture; never executed');}
 return root;
}
test('recording decoder enforces format, duration, completeness and silence',()=>{assert.equal(decodeSpeechWav(wav().toString('base64')).duration,1);assert.equal(decodeSpeechWav(wav(1,0).toString('base64')).silent,true);assert.throws(()=>decodeSpeechWav(wav().subarray(0,500).toString('base64')),/不完整/);assert.throws(()=>decodeSpeechWav(wav(.1).toString('base64')),/0.2/);const stereo=wav();stereo.writeUInt16LE(2,22);assert.throws(()=>decodeSpeechWav(stereo.toString('base64')),/单声道/);assert.throws(()=>decodeSpeechWav('not valid'),/格式/);});
test('speech job rejects concurrency, cancels hidden native process and removes temporary audio',async()=>{
 await fs.mkdir('.test-data/speech-jobs',{recursive:true});const tempDir=await fs.mkdtemp(path.resolve('.test-data/speech-jobs/run-'));let child,options,completeClose;
 const engine=createSpeechEngine({resourceDir:await speechResources(),tempDir,spawnImpl:(_exe,_args,o)=>{options=o;child=new EventEmitter();child.stderr=new EventEmitter();o.signal.addEventListener('abort',()=>{child.emit('error',Error('aborted'));completeClose=()=>child.emit('close',null);});return child;}});
 const result=engine.transcribe({base64:wav().toString('base64'),mime:'audio/wav'});const check=assert.rejects(result,/已停止/);
 await assert.rejects(engine.transcribe({base64:wav().toString('base64')}),/上一段/);for(let i=0;i<100&&!child;i++)await new Promise(r=>setTimeout(r,5));assert.equal(options.windowsHide,true);engine.cancel();assert.equal((await engine.status()).busy,true);assert.equal((await fs.readdir(tempDir)).length,1);completeClose();await check;assert.deepEqual(await fs.readdir(tempDir),[]);assert.equal((await engine.status()).busy,false);
});
test('short automatic recordings prefer Chinese while explicit English remains English',async()=>{
 const tempDir=await fs.mkdtemp(path.resolve('.test-data/speech-language-'));const calls=[];
 const engine=createSpeechEngine({resourceDir:await speechResources(),tempDir,spawnImpl:(_exe,args,options)=>{
  calls.push(args);const child=new EventEmitter();child.stderr=new EventEmitter();
  setTimeout(async()=>{await fs.writeFile(path.join(options.cwd,'transcript.json'),JSON.stringify({transcription:[{text:'你好瓜瓜'}]}));child.emit('close',0);},10);return child;
 }});
 for(const language of ['auto','en'])assert.equal((await engine.transcribe({base64:wav().toString('base64'),language})).text,'你好瓜瓜');
 assert.equal(calls[0][calls[0].indexOf('-l')+1],'zh');assert.ok(calls[0].includes('--prompt'));assert.equal(calls[1][calls[1].indexOf('-l')+1],'en');assert.ok(!calls[1].includes('--prompt'));assert.deepEqual(await fs.readdir(tempDir),[]);
});
