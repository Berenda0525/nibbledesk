import React,{useEffect,useRef,useState} from 'react';
const defaults={sidebar:235,document:380};
export default function useSplitLayout({documentOpen,moduleView}){
 const [sizes,setSizes]=useState(()=>{try{const s=JSON.parse(localStorage.getItem('guagua-splits'));return {sidebar:Number(s?.sidebar)||235,document:Number(s?.document)||380};}catch{return defaults;}}),[dragging,setDragging]=useState(false);
 const root=useRef(null),current=useRef(sizes);current.current=sizes;
 const limits=(key,value)=>{const width=root.current?.clientWidth||1035,sidebar=documentOpen?Math.max(170,Math.min(current.current.sidebar,width-615)):current.current.sidebar;return Math.round(Math.max(key==='sidebar'?170:260,Math.min(key==='sidebar'?Math.min(400,width-(documentOpen?615:360)):width-(moduleView?60:sidebar+66)-280,value)));};
 const adjust=(key,value)=>setSizes(s=>({...s,[key]:limits(key,value)}));
 useEffect(()=>{try{localStorage.setItem('guagua-splits',JSON.stringify(sizes));}catch{}},[sizes]);
 useEffect(()=>{const resize=()=>{setSizes(s=>({sidebar:limits('sidebar',s.sidebar),document:limits('document',s.document)}));};const observer=new ResizeObserver(resize);if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[documentOpen,moduleView]);
 const separator=key=><div className={`workspace-separator separator-${key}`} role="separator" aria-label={key==='sidebar'?'调整会话列宽度':'调整阅读区宽度'} aria-orientation="vertical" aria-valuemin={key==='sidebar'?170:260} aria-valuemax={key==='sidebar'?400:Math.max(260,(root.current?.clientWidth||1035)-300)} aria-valuenow={sizes[key]} tabIndex={0}
  onDoubleClick={()=>adjust(key,defaults[key])} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();adjust(key,e.key==='Home'?0:e.key==='End'?9999:sizes[key]+(e.key==='ArrowRight'?1:-1)*(key==='document'?-16:16));}}}
  onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();const start=e.clientX,value=current.current[key];e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.start=start;e.currentTarget.dataset.value=value;setDragging(true);}}
  onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))adjust(key,Number(e.currentTarget.dataset.value)+(e.clientX-Number(e.currentTarget.dataset.start))*(key==='document'?-1:1));}}
  onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);setDragging(false);}} onLostPointerCapture={()=>setDragging(false)}/>;
 return {root,style:{'--sidebar-width':sizes.sidebar+'px','--document-width':sizes.document+'px'},dragging,separator};
}
