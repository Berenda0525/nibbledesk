import React,{Suspense,lazy,useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {X,Download,LoaderCircle,FileText,Image,FileSpreadsheet,Presentation,AlertCircle,MessageSquarePlus,MessageSquare,Send,PanelRightClose} from 'lucide-react';
import {IconButton} from './Common.jsx';
const PdfPreview=lazy(()=>import('./PdfPreview.jsx'));

/** 阅读区只呈现文件与修改批注，正文修改由聊天中的 Agent 交付新版本。 */
export default function ReadWorkspace({document:initial,call,onSaveAs,onClose,onRequestChange,onCollapse,initialDraft,onDraft}){
 const [doc,setDoc]=useState(initial),[pdf,setPdf]=useState(initial.base64),[notes,setNotes]=useState(initial.notes||[]),[notesOpen,setNotesOpen]=useState(!!initialDraft),[draft,setDraft]=useState(initialDraft||null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[leave,setLeave]=useState(false),[closing,setClosing]=useState(false);
 const iframe=useRef(null),panel=useRef(null),dirty=!!draft?.text?.trim();
 const office=['word','sheet','presentation'].includes(doc.kind),text=['markdown','text'].includes(doc.kind),Icon=doc.kind==='sheet'?FileSpreadsheet:doc.kind==='presentation'?Presentation:doc.kind==='image'?Image:FileText;
 useEffect(()=>{if(!doc.session?.url)return;const origin=new URL(doc.session.url).origin;const receive=e=>{if(e.origin!==origin||e.source!==iframe.current?.contentWindow)return;
  if(e.data?.type==='guagua-document-ready')iframe.current.contentWindow.postMessage({type:'guagua-office-preview'},origin);
  if(e.data?.type==='guagua-document-preview'&&typeof e.data.base64==='string'&&e.data.base64.length<28*1024*1024){setPdf(e.data.base64);if(doc.previewKey)call('cacheDocumentPreview',{id:doc.id,previewKey:doc.previewKey,base64:e.data.base64}).catch(e=>setError('预览可查看，缓存保存失败：'+e.message));}
  if(['guagua-preview-error','guagua-document-error'].includes(e.data?.type))setError(e.data.message||'文件预览失败');
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[doc.session?.url]);
 useEffect(()=>{onDraft?.(draft);},[draft]);
 useEffect(()=>()=>{if(doc.session?.sessionId)window.stellar?.call('closeDocument',{sessionId:doc.session.sessionId}).catch(()=>{});},[doc.session?.sessionId]);
 useEffect(()=>{const prevent=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
 const close=async()=>{onDraft?.(null);if(doc.session?.sessionId){try{await call('closeDocument',{sessionId:doc.session.sessionId});}catch(e){setError(e.message);return;}}setClosing(true);setTimeout(onClose,260);};
 const addNote=point=>{const selection=window.getSelection();const quote=selection?.anchorNode&&panel.current?.contains(selection.anchorNode)?selection.toString().slice(0,2000):'';setNotesOpen(true);setDraft({...point,quote:point?.quote||quote,text:point?.text||''});};
 const saveNote=async()=>{if(!draft?.text?.trim())return false;setSaving(true);setError('');try{const next=[...notes.filter(n=>n.id!==draft.id),{...draft,id:draft.id||crypto.randomUUID(),text:draft.text.trim()}];const result=await call('saveAnnotations',{id:doc.id,notes:next,revision:doc.notesRevision||0});setNotes(result.notes);setDoc(d=>({...d,notesRevision:result.notesRevision}));setDraft(null);return true;}catch(e){setError(e.message);return false;}finally{setSaving(false);}};
 return <aside ref={panel} className={`document-workspace document-docked reading-workspace ${closing?'closing':''}`} aria-label={`阅读：${doc.name}`}>
  <header className="document-toolbar"><Icon size={17}/><div className="document-title"><strong>{doc.name}</strong><small>快速阅读</small></div><div className="document-actions"><IconButton title="另存为" onClick={()=>onSaveAs(doc.id)}><Download size={16}/></IconButton><IconButton title="收起阅读区" onClick={onCollapse}><PanelRightClose size={17}/></IconButton><IconButton title="关闭文件面板" disabled={saving} onClick={()=>dirty?setLeave(true):close()}><X size={17}/></IconButton></div></header>
  <div className="document-commandbar"><span className="reader-kind">{office?'办公文档':doc.kind==='pdf'?'PDF':text?'文本':'文件'}</span><button className="text-button" onClick={()=>addNote({page:0})}><MessageSquarePlus size={14}/>添加批注</button><IconButton title="查看批注" onClick={()=>setNotesOpen(v=>!v)}><MessageSquare size={15}/></IconButton>{notes.length>0&&<button className="text-button" onClick={()=>onRequestChange?.(doc,notes)}><Send size={14}/>请求修改</button>}</div>
  {error&&<div className="document-error" role="alert"><AlertCircle size={15}/>{error}</div>}
  <div className={`document-stage document-stage-${doc.kind}`}>
   {office&&doc.session?.url&&<iframe className="office-preview-engine" ref={iframe} title={`${doc.name} 页面转换`} src={doc.session.url} referrerPolicy="no-referrer"/>}
   {office||doc.kind==='pdf'?(pdf?<Suspense fallback={<div className="document-unavailable"><LoaderCircle className="spin" size={24}/></div>}><PdfPreview base64={pdf} notes={notes} onAnnotate={addNote}/></Suspense>:<div className="document-unavailable"><LoaderCircle className="spin" size={24}/><p>正在准备页面预览</p><small>首次打开需要载入办公引擎</small></div>):text?<div className="reader-text">{doc.kind==='markdown'?<ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content||''}</ReactMarkdown>:<pre>{doc.content||''}</pre>}</div>:doc.kind==='image'&&doc.url?<img className="document-image-preview" src={doc.url} alt={doc.name}/>:<div className="document-unavailable"><Icon size={36}/><p>此文件可下载后打开</p><button className="button" onClick={()=>onSaveAs(doc.id)}>另存文件</button></div>}
  </div>
  {notesOpen&&<section className="document-notes" aria-label="文件批注"><header><strong>批注 {notes.length||''}</strong><IconButton title="收起批注" onClick={()=>setNotesOpen(false)}><X size={14}/></IconButton></header><div className="document-notes-list">{notes.map((n,i)=><button className="document-note" key={n.id} onClick={()=>setDraft(n)}><small>{n.page?'第 '+n.page+' 页':'文本'} · {i+1}</small>{n.quote&&<blockquote>{n.quote}</blockquote>}<p>{n.text}</p></button>)}{!notes.length&&!draft&&<p className="field-hint">选中文字或点击页面，记录希望 Agent 修改的位置。</p>}</div>{draft&&<div className="note-compose">{draft.quote&&<blockquote>{draft.quote}</blockquote>}<textarea autoFocus aria-label="批注内容" maxLength={4000} value={draft.text} onChange={e=>setDraft(d=>({...d,text:e.target.value}))}/><div><button className="text-button" onClick={()=>setDraft(null)}>取消</button><button className="button primary" disabled={saving||!draft.text.trim()} onClick={saveNote}>保存批注</button></div></div>}</section>}
  <footer className="document-statusbar"><span>本机文件 · 快速阅读</span><span>{dirty?'批注待保存':'正文修改可交给聊天中的助手'}</span></footer>
  {leave&&<div className="document-confirm-backdrop"><section role="alertdialog"><h2>保存批注后再关闭？</h2><div><button className="button" onClick={()=>setLeave(false)}>继续查看</button><button className="button" onClick={close}>放弃批注</button><button className="button primary" disabled={saving} onClick={async()=>{if(await saveNote())close();}}>保存并关闭</button></div></section></div>}
 </aside>;
}
