import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import os from 'node:os';

export function decodeSpeechWav(base64){
  if(typeof base64!=='string'||base64.length>5200000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new Error('录音格式无效或超过两分钟');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('请提交 WAV 格式录音');
  let format,data;
  for(let offset=12;offset+8<=bytes.length;){
    const size=bytes.readUInt32LE(offset+4),start=offset+8,end=start+size;
    if(end>bytes.length)throw new Error('录音文件不完整');
    const type=bytes.toString('ascii',offset,offset+4);
    if(type==='fmt '){if(size<16)throw new Error('录音参数无效');format={codec:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),bits:bytes.readUInt16LE(start+14)};}
    if(type==='data')data=bytes.subarray(start,end);
    offset=end+(size%2);
  }
  if(!format||!data||format.codec!==1||format.channels!==1||format.rate!==16000||format.bits!==16||data.length%2)throw new Error('录音需要 16 kHz 单声道 PCM16 格式');
  const duration=data.length/32000;if(duration<.2||duration>120)throw new Error('每段录音需在 0.2 秒至 2 分钟之间');
  let energy=0;for(let i=0;i<data.length;i+=2)energy+=(data.readInt16LE(i)/32768)**2;
  return {bytes,duration,silent:Math.sqrt(energy/(data.length/2))<0.0001};
}

export function createSpeechEngine({resourceDir,tempDir,spawnImpl=spawn}){
  const executable=path.join(resourceDir,'runtime','Release','whisper-cli.exe'),model=path.join(resourceDir,'models','ggml-base.bin');
  const senseExecutable=path.join(resourceDir,'runtime','sensevoice','sherpa-onnx-offline.exe');
  const senseModel=path.join(resourceDir,'models','sensevoice','model.int8.onnx'),senseTokens=path.join(resourceDir,'models','sensevoice','tokens.txt');
  let running=null;
  async function status(){
    try{await Promise.all([senseExecutable,senseModel,senseTokens,path.join(resourceDir,'runtime','sensevoice','onnxruntime.dll')].map(file=>fs.access(file)));return {available:true,provider:'local',model:'sensevoice-small-int8',busy:!!running};}catch{}
    try{await Promise.all([fs.access(executable),fs.access(model)]);return {available:true,provider:'local',model:'whisper-base',busy:!!running};}catch{return {available:false,provider:'local',model:'whisper-base',message:'本地语音组件不完整，请重新安装瓜瓜。'};}
  }
  async function transcribe({base64,mime,language='zh'}){
    if(running)throw new Error('上一段录音仍在识别，请稍候');
    if(mime&&mime!=='audio/wav'&&mime!=='audio/x-wav')throw new Error('请提交 WAV 格式录音');
    if(!['auto','zh','en'].includes(language))throw new Error('识别语言无效');
    const wav=decodeSpeechWav(base64);
    const controller=new AbortController();running=controller;
    let directory;
    try{
      const ready=await status();if(!ready.available)throw new Error(ready.message);
      if(wav.silent)return {text:'',model:ready.model,provider:'local'};
      const useSenseVoice=ready.model==='sensevoice-small-int8';let standardOutput='';
      await fs.mkdir(tempDir,{recursive:true});directory=await fs.mkdtemp(path.join(tempDir,'speech-'));
      const input=path.join(directory,'recording.wav'),output=path.join(directory,'transcript');
      controller.signal.throwIfAborted();
      await fs.writeFile(input,wav.bytes,{flag:'wx'});
      await new Promise((resolve,reject)=>{
        // 短句的语种检测容易漂移；自动模式对六秒内录音优先采用中文。
        const resolvedLanguage=language==='auto'&&wav.duration<6?'zh':language;
        const args=useSenseVoice
          ?[`--tokens=${path.relative(directory,senseTokens)}`,`--sense-voice-model=${path.relative(directory,senseModel)}`,`--sense-voice-language=${resolvedLanguage}`,'--sense-voice-use-itn=1','--num-threads=2','--debug=0','recording.wav']
          :['-m',path.relative(directory,model),'-f','recording.wav','-l',resolvedLanguage,...(resolvedLanguage==='zh'?['--prompt','以下是普通话，请用简体中文记录。瓜瓜。']:[]),'-t',String(Math.max(1,Math.min(4,os.availableParallelism?.()??2))),'-ng','-oj','-of','transcript','-nt','-np'];
        const child=spawnImpl(useSenseVoice?senseExecutable:executable,args,{cwd:directory,windowsHide:true,stdio:['ignore',useSenseVoice?'pipe':'ignore','pipe'],signal:controller.signal});
        let diagnostic='',processError;child.stderr?.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-6000);});
        child.stdout?.setEncoding?.('utf8');
        // Keep split multibyte characters intact and bound native output before parsing.
        const outputChunks=[];let outputBytes=0;
        child.stdout?.on('data',chunk=>{outputBytes+=Buffer.byteLength(chunk);if(outputBytes>1048576){processError=new Error('语音组件返回内容过大');controller.abort();return;}outputChunks.push(Buffer.from(chunk));});
        const timeout=setTimeout(()=>controller.abort(),180000);timeout.unref?.();
        child.once('error',error=>{processError??=controller.signal.aborted?new Error('语音识别已停止'):new Error('本地语音组件启动失败，请检查安装文件。',{cause:error});});
        child.once('close',code=>{clearTimeout(timeout);if(processError)reject(processError);else if(controller.signal.aborted)reject(new Error('语音识别已停止'));else if(code===0){standardOutput=Buffer.concat(outputChunks).toString('utf8');resolve();}else reject(new Error(`语音识别失败（${code??'启动异常'}）${/failed to open.*model/i.test(diagnostic)?'，模型文件无法读取':''}`));});
      });
      let result;try{result=JSON.parse(useSenseVoice?standardOutput:await fs.readFile(output+'.json','utf8'));}catch{throw new Error('本地语音组件返回了无效结果，请重试');}
      if(useSenseVoice?typeof result?.text!=='string':!Array.isArray(result?.transcription))throw new Error('本地语音组件返回了无效结果，请重试');
      const text=(useSenseVoice?(typeof result?.text==='string'?result.text:''):(result.transcription??[]).map(segment=>segment.text??'').join('')).trim().slice(0,20000);
      return {text,model:ready.model,provider:'local'};
    }finally{
      if(running===controller)running=null;
      if(directory){for(const name of ['recording.wav','transcript.json'])await fs.unlink(path.join(directory,name)).catch(()=>{});await fs.rmdir(directory).catch(()=>{});}
    }
  }
  return {status,transcribe,cancel(){running?.abort();},dispose(){running?.abort();}};
}
