import React,{useEffect,useRef,useState} from 'react';
import {Mic,Square,LoaderCircle,X} from 'lucide-react';
import {IconButton} from './Common.jsx';

import {audioToWav} from '../../shared/audio-wav.mjs';
export {audioToWav};

export default function VoiceInput({enabled,disabled,onText,onSettings,transcribe,onCancel}){
 const [phase,setPhase]=useState('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const recorder=useRef(null),stream=useRef(null),timer=useRef(null),alive=useRef(true),discard=useRef(false),generation=useRef(0),currentPhase=useRef(phase);
 currentPhase.current=phase;
 const cleanup=()=>{clearInterval(timer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
 useEffect(()=>{alive.current=true;const release=()=>{discard.current=true;generation.current++;if(recorder.current?.state==='recording')recorder.current.stop();cleanup();if(currentPhase.current==='transcribing')Promise.resolve(onCancel?.()).catch(()=>{});};const hide=()=>{if(document.hidden){release();setPhase('idle');}};document.addEventListener('visibilitychange',hide);return()=>{alive.current=false;release();document.removeEventListener('visibilitychange',hide);};},[]);
 useEffect(()=>{if(!enabled&&currentPhase.current!=='idle'){discard.current=true;generation.current++;if(recorder.current?.state==='recording')recorder.current.stop();cleanup();if(currentPhase.current==='transcribing')Promise.resolve(onCancel?.()).catch(()=>{});setPhase('idle');}},[enabled]);
 const stop=(cancel=false)=>{discard.current=cancel;if(recorder.current?.state==='recording')recorder.current.stop();cleanup();};
 const cancelRecognition=()=>{generation.current++;discard.current=true;setPhase('idle');Promise.resolve(onCancel?.()).catch(()=>{});};
 const start=async()=>{
  if(!enabled){onSettings();return;}setError('');setPhase('requesting');discard.current=false;const version=++generation.current;
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('当前设备无法使用麦克风，请继续输入文字。');
   const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
   if(!alive.current||version!==generation.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
   const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
   const current=new MediaRecorder(media,mime?{mimeType:mime}:undefined),chunks=[];recorder.current=current;
   current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   current.onerror=()=>{discard.current=true;cleanup();if(alive.current){setError('录音中断，请重试或输入文字。');setPhase('idle');}};
   current.onstop=async()=>{cleanup();if(!alive.current)return;if(discard.current){setPhase('idle');return;}setPhase('transcribing');try{const base64=await audioToWav(new Blob(chunks,{type:current.mimeType}));if(!alive.current||version!==generation.current)return;const result=await transcribe({base64,mime:'audio/wav'});if(alive.current&&version===generation.current){if(result?.text?.trim())onText(result.text.trim());else setError('没有识别到文字，请重试或手动输入。');}}catch(e){if(alive.current&&version===generation.current)setError(e.message||'语音识别失败，请继续输入文字。');}finally{if(alive.current&&version===generation.current)setPhase('idle');}};
   current.start();setSeconds(0);setPhase('recording');let elapsed=0;timer.current=setInterval(()=>{elapsed++;setSeconds(elapsed);if(elapsed>=120)stop();},1000);
  }catch(e){cleanup();if(alive.current){setPhase('idle');setError(e.name==='NotAllowedError'?'麦克风权限未开启，可在系统设置中允许后重试。':e.message||'无法打开麦克风。');}}
 };
 return <div className="voice-input"><IconButton title={phase==='recording'?'结束录音并识别':phase==='transcribing'?'正在本机识别':enabled?'语音输入':'开启语音输入'} className={phase==='recording'?'voice-recording':''} disabled={disabled||phase==='requesting'||phase==='transcribing'} onClick={()=>phase==='recording'?stop():start()}>{phase==='transcribing'||phase==='requesting'?<LoaderCircle size={19} className="spin"/>:phase==='recording'?<Square size={17}/>:<Mic size={20}/>}</IconButton>{phase==='recording'&&<div className="voice-status" role="status"><span className="record-dot"/>录音 {seconds}s<IconButton title="取消录音" onClick={()=>stop(true)}><X size={13}/></IconButton></div>}{phase==='transcribing'&&<span className="voice-status" role="status">本机识别中…<IconButton title="取消识别" onClick={cancelRecognition}><X size={13}/></IconButton></span>}{error&&<div className="voice-error" role="alert"><span>{error}</span><IconButton title="关闭语音提示" onClick={()=>setError('')}><X size={13}/></IconButton></div>}</div>;
}
