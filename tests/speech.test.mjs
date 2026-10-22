import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {decodeSpeechWav,createSpeechEngine} from '../desktop/speech.mjs';
function wav(seconds=1,amplitude=1000){const b=Buffer.alloc(44+seconds*32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let i=44;i<b.length;i+=2)b.writeInt16LE(amplitude*Math.sin(i),i);return b;}
// Process mocks exercise the adapter without depending on installed speech models.
async function speechResources(senseVoice=false){
 await fs.mkdir('.test-data',{recursive:true});const root=await fs.mkdtemp(path.resolve('.test-data/speech-resources-'));
 const names=['runtime/Release/whisper-cli.exe','models/ggml-base.bin'];
 if(senseVoice)names.push('runtime/sensevoice/sherpa-onnx-offline.exe','runtime/sensevoice/onnxruntime.dll','runtime/sensevoice/sherpa-onnx-core.dll','models/sensevoice/model.int8.onnx','models/sensevoice/tokens.txt');
 for(const relative of names){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture, never executed');}
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

test('complete SenseVoice resources use local Chinese decoder and bounded UTF-8 JSON output',async()=>{
 const resourceDir=await speechResources(true),tempDir=await fs.mkdtemp(path.resolve('.test-data/sensevoice-job-'));let invocation;
 const engine=createSpeechEngine({resourceDir,tempDir,spawnImpl:(exe,args,options)=>{
  invocation={exe,args,options};const child=new EventEmitter();child.stderr=new EventEmitter();child.stdout=new EventEmitter();
  setTimeout(()=>{const bytes=Buffer.from(JSON.stringify({text:'你好，中文文档。'}));child.stdout.emit('data',bytes.subarray(0,12));child.stdout.emit('data',bytes.subarray(12));child.emit('close',0);},5);return child;
 }});
 assert.equal((await engine.status()).model,'sensevoice-small-int8');
 const result=await engine.transcribe({base64:wav().toString('base64'),language:'zh'});
 assert.equal(result.text,'你好，中文文档。');assert.equal(result.provider,'local');assert.match(invocation.exe,/sherpa-onnx-offline\.exe$/);
 assert.ok(invocation.args.includes('--sense-voice-language=zh'));assert.ok(invocation.args.includes('--sense-voice-use-itn=1'));assert.equal(invocation.options.windowsHide,true);
 assert.deepEqual(await fs.readdir(tempDir),[]);
 await fs.unlink(path.join(resourceDir,'models/sensevoice/tokens.txt'));assert.equal((await engine.status()).model,'whisper-base');
});

test('SenseVoice process failure preserves cancellation cleanup and never retries audio elsewhere',async()=>{
 const resourceDir=await speechResources(true),tempDir=await fs.mkdtemp(path.resolve('.test-data/sensevoice-cancel-'));let child,calls=0;
 const engine=createSpeechEngine({resourceDir,tempDir,spawnImpl:(_exe,_args,options)=>{
  calls++;child=new EventEmitter();child.stderr=new EventEmitter();child.stdout=new EventEmitter();options.signal.addEventListener('abort',()=>{child.emit('error',Error('abort'));setTimeout(()=>child.emit('close',null),5);});return child;
 }});
 const pending=engine.transcribe({base64:wav().toString('base64')}),rejected=assert.rejects(pending,/已停止/);
 for(let i=0;i<100&&!child;i++)await new Promise(r=>setTimeout(r,5));engine.cancel();await rejected;
 assert.equal(calls,1);assert.equal((await engine.status()).busy,false);assert.deepEqual(await fs.readdir(tempDir),[]);
});

test('SenseVoice malformed or excessive output fails clearly and removes temporary audio',async()=>{
 for(const output of ['not json','{}','x'.repeat(1048577)]){
  const resourceDir=await speechResources(true),tempDir=await fs.mkdtemp(path.resolve('.test-data/sensevoice-invalid-'));
  const engine=createSpeechEngine({resourceDir,tempDir,spawnImpl:(_exe,_args,options)=>{
   const child=new EventEmitter();child.stderr=new EventEmitter();child.stdout=new EventEmitter();
   options.signal.addEventListener('abort',()=>child.emit('error',Error('abort')));
   setTimeout(()=>{child.stdout.emit('data',Buffer.from(output));child.emit('close',0);},5);return child;
  }});
  await assert.rejects(engine.transcribe({base64:wav().toString('base64')}),/无效结果|内容过大/);
  assert.deepEqual(await fs.readdir(tempDir),[]);assert.equal((await engine.status()).busy,false);
 }
});
