import React,{useEffect,useRef,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import './music.css';
export default function MusicWorkspace({call}){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),host=useRef(null);
 useEffect(()=>{let live=true,frame;const resize=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync);});
  const sync=()=>{if(!live||!host.current)return;const r=host.current.getBoundingClientRect();if(r.width>1&&r.height>1)call('music:mount',{bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}).catch(e=>{if(live)setError(e.message);});};
  call('music:getState').then(()=>{if(live){setReady(true);sync();resize.observe(host.current);}}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;cancelAnimationFrame(frame);resize.disconnect();call('music:hide').catch(()=>{});};
 },[]);
 return <section className="music-workspace"><div ref={host} className="music-native-host" role="region" aria-label="音乐播放器">{error?<div className="document-unavailable" role="alert"><p>{error}</p><button className="button" onClick={()=>{setError('');call('music:reload').catch(e=>setError(e.message));}}>重新加载</button></div>:!ready&&<div className="document-unavailable"><LoaderCircle size={24} className="spin"/></div>}</div></section>;
}
