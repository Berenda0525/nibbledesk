import React,{useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Minus,Plus,LoaderCircle,AlertCircle,Grid2X2,FileText,MessageSquarePlus} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {IconButton} from './Common.jsx';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorker;

/** 页面按可见区域绘制，网格不会同时为整份文件分配高清画布。 */
function PageCanvas({pdf,page,zoom=1,thumbnail=false,notes=[],annotating,onAnnotate,onOpen}){
 const holder=useRef(null),canvas=useRef(null),[visible,setVisible]=useState(false),[width,setWidth]=useState(0),[aspect,setAspect]=useState(210/297),[error,setError]=useState(''),[rendered,setRendered]=useState(false);
 useEffect(()=>{const el=holder.current;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setVisible(true);},{rootMargin:'180px'});observer.observe(el);const resize=new ResizeObserver(entries=>setWidth(Math.floor(entries[0].contentRect.width)));resize.observe(el);return()=>{observer.disconnect();resize.disconnect();};},[]);
 useEffect(()=>{if(!visible||!width)return;let live=true,task;setRendered(false);
  pdf.getPage(page).then(async p=>{if(!live)return;const original=p.getViewport({scale:1});setAspect(original.width/original.height);const scale=Math.min(width/original.width,thumbnail ? .5 : 2)*zoom,viewport=p.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2),el=canvas.current;el.width=Math.ceil(viewport.width*ratio);el.height=Math.ceil(viewport.height*ratio);el.style.width=viewport.width+'px';el.style.height=viewport.height+'px';task=p.render({canvasContext:el.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});await task.promise;if(live)setRendered(true);}).catch(e=>{if(live&&e.name!=='RenderingCancelledException')setError('页面渲染失败');});return()=>{live=false;task?.cancel();};
 },[pdf,page,zoom,thumbnail,visible,width]);
 return <div ref={holder} aria-busy={!rendered&&!error} style={{'--page-index':page-1}} className={'pdf-page-holder '+(thumbnail?'thumbnail':'')}>
  <div style={thumbnail?{aspectRatio:aspect}:undefined} className={'pdf-paper '+(annotating?'annotating':'')} onClick={e=>{if(thumbnail){onOpen(page);return;}if(annotating){const r=e.currentTarget.getBoundingClientRect();onAnnotate?.({page,x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))});}}}>
   <canvas ref={canvas} aria-label={'PDF 第 '+page+' 页'}/>{error&&<p role="alert">{error}</p>}
   {!thumbnail&&notes.filter(n=>n.page===page&&n.x!==undefined).map((n,i)=><button key={n.id} className="pdf-note-marker" style={{left:n.x*100+'%',top:n.y*100+'%'}} title={n.text} aria-label={'批注 '+(i+1)+'：'+n.text} onClick={e=>{e.stopPropagation();onAnnotate?.({...n,existing:true});}}>{i+1}</button>)}
  </div>{thumbnail&&<button className="pdf-page-number" onClick={()=>onOpen(page)}>第 {page} 页</button>}
 </div>;
}
export default function PdfPreview({base64,notes=[],onAnnotate}){
 const [pdf,setPdf]=useState(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[grid,setGrid]=useState(false),[annotating,setAnnotating]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true,task;setError('');setPdf(null);try{task=pdfjs.getDocument({data:Uint8Array.from(atob(base64||''),c=>c.charCodeAt(0)),isEvalSupported:false});task.promise.then(doc=>{if(live){setPdf(doc);setPage(p=>Math.min(p,doc.numPages));}}).catch(e=>{if(live)setError(e.message||'PDF 无法打开');});}catch(e){setError(e.message||'PDF 数据无效');}return()=>{live=false;task?.destroy();};},[base64]);
 return <div className="pdf-preview"><div className="pdf-toolbar">
  <IconButton title={grid?'连续页面':'页面网格'} onClick={()=>{setGrid(v=>!v);setAnnotating(false);}}>{grid?<FileText size={16}/>:<Grid2X2 size={16}/>}</IconButton>
  <IconButton title="上一页" onClick={()=>setPage(p=>p-1)} disabled={grid||!pdf||page<=1}><ChevronLeft size={17}/></IconButton><label><input aria-label="PDF 页码" type="number" min={1} max={pdf?.numPages||1} value={page} onChange={e=>{setPage(Math.min(pdf?.numPages||1,Math.max(1,Number(e.target.value)||1)));setGrid(false);}}/><span>/ {pdf?.numPages||'—'}</span></label><IconButton title="下一页" onClick={()=>setPage(p=>p+1)} disabled={grid||!pdf||page>=pdf.numPages}><ChevronRight size={17}/></IconButton>
  <i/><IconButton title="缩小 PDF" onClick={()=>setZoom(v=>Math.max(.5,v-.25))} disabled={grid||zoom<=.5}><Minus size={16}/></IconButton><span>{Math.round(zoom*100)}%</span><IconButton title="放大 PDF" onClick={()=>setZoom(v=>Math.min(2,v+.25))} disabled={grid||zoom>=2}><Plus size={16}/></IconButton>
  {onAnnotate&&<IconButton title={annotating?'退出区域批注':'标注页面'} onClick={()=>{setGrid(false);setAnnotating(v=>!v);}} className={annotating?'selected':''}><MessageSquarePlus size={16}/></IconButton>}
 </div>{annotating&&<div className="annotation-hint">点击页面中的位置，写下需要修改的内容。</div>}
 <div key={grid?'grid':'page-'+page} className={'pdf-pages '+(grid?'pdf-grid':'')}>{error?<div className="document-unavailable" role="alert"><AlertCircle size={30}/><p>{error}</p></div>:!pdf?<div className="document-unavailable"><LoaderCircle className="spin" size={24}/></div>:grid?Array.from({length:pdf.numPages},(_,i)=><PageCanvas key={i+1} pdf={pdf} page={i+1} thumbnail onOpen={p=>{setPage(p);setGrid(false);}}/>):<PageCanvas key={page} pdf={pdf} page={page} zoom={zoom} notes={notes} annotating={annotating} onAnnotate={onAnnotate}/>}</div></div>;
}
