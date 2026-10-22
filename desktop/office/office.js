/* Uses the MIT-licensed ZetaJS interface; the office engine is distributed separately. */
'use strict';
var Module;
const canvas=document.getElementById('qtcanvas'),statusElement=document.getElementById('office-status'),errorElement=document.getElementById('office-error');
const baseURL=new URL('../',location.href),runtimeURL=new URL('runtime/',baseURL),sessionId=new URLSearchParams(location.search).get('session');
const sessionURL=new URL('session/'+encodeURIComponent(sessionId)+'/',baseURL);
let session,thread,loaded=false,saving=false,dirty=false,editVersion=0,saveRequested=false;
const notify=(type,details={})=>parent.postMessage({type,...details},location.origin);
function setDirty(value){dirty=value;notify('guagua-document-dirty',{dirty:value});}
function showError(error){const message=String(error?.message||error);errorElement.textContent=message;errorElement.hidden=false;statusElement.hidden=true;notify('guagua-document-error',{message});}
function requestSave(){if(!loaded||!thread)return;if(saveRequested||saving)return;saveRequested=true;thread.postMessage({cmd:'save'});}
async function persistDocument(){
  if(saving)return;saving=true;saveRequested=false;const version=editVersion;
  try{
    const bytes=FS.readFile('/tmp/office/document.'+session.kind);
    const response=await fetch(new URL('save',sessionURL),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Document-Revision':String(session.revision)},body:bytes});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'保存失败');
    session={...session,...result.session};
    if(editVersion===version)setDirty(false);
    errorElement.hidden=true;notify('guagua-document-saved',{asset:result.asset,dirty});
  }catch(error){setDirty(true);showError(error);}finally{saving=false;}
}
async function openDocument(){
  try{FS.mkdir('/tmp/office');}catch{}
  if(!session.isNew){const response=await fetch(new URL('document',sessionURL));if(!response.ok)throw new Error('文档读取失败');FS.writeFile('/tmp/office/document.'+session.kind,new Uint8Array(await response.arrayBuffer()));}
  thread.postMessage({cmd:'open',kind:session.kind,isNew:session.isNew});
}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent)return;if(event.data?.type==='guagua-office-save')requestSave();if(event.data?.type==='guagua-office-preview'&&loaded)thread.postMessage({cmd:'preview'});});
window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopImmediatePropagation();if(event.shiftKey)notify('guagua-document-export');else requestSave();}},true);
window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
canvas.addEventListener('keydown',event=>event.preventDefault());
canvas.addEventListener('selectstart',event=>event.preventDefault());
new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(document.body);

async function start(){
  if(!crossOriginIsolated)throw new Error('办公编辑器的隔离环境未就绪，请重新打开软件。');
  const response=await fetch(new URL('info',sessionURL));session=await response.json();if(!response.ok)throw new Error(session.error||'文档编辑会话已结束');
  Module={canvas,uno_scripts:[new URL('office/zeta.js',baseURL).href,new URL('office/office-thread.js',baseURL).href],locateFile:file=>new URL(file,runtimeURL).href,onAbort:reason=>showError('办公引擎启动失败：'+String(reason).slice(0,300)),preRun:[()=>{
    FS.mkdirTree('/instdir/share/fonts/truetype');
    FS.createPreloadedFile('/instdir/share/fonts/truetype','NotoSansCJKsc-Regular.otf',new URL('fonts/NotoSansCJKsc-Regular.otf',runtimeURL).href,true,false);
  }]};
  Module.mainScriptUrlOrBlob=new Blob([`importScripts(${JSON.stringify(new URL('soffice.js',runtimeURL).href)});`],{type:'text/javascript'});
  const script=document.createElement('script');script.src=new URL('soffice.js',runtimeURL).href;
  script.onerror=()=>showError('办公引擎文件读取失败，请重新安装软件。');
  script.onload=()=>Module.uno_main.then(port=>{
    thread=port;thread.onmessage=event=>{
      const message=event.data;
      if(message.cmd==='thread-ready')openDocument().catch(showError);
      else if(message.cmd==='document-ready'){
        window.dispatchEvent(new Event('resize'));
        setTimeout(()=>{loaded=true;canvas.style.visibility='visible';statusElement.hidden=true;window.dispatchEvent(new Event('resize'));notify('guagua-document-ready');if(session.isNew){editVersion++;setDirty(true);requestSave();}else setDirty(false);},1200);
      }else if(message.cmd==='modified'){if(message.dirty){editVersion++;setDirty(true);}}
      else if(message.cmd==='save-request')requestSave();
      else if(message.cmd==='export-request')notify('guagua-document-export');
      else if(message.cmd==='stored')persistDocument();
      else if(message.cmd==='preview-ready'){
        const bytes=FS.readFile('/tmp/office/preview.pdf');
        if(bytes.length>20*1024*1024){notify('guagua-preview-error',{message:'预览超过 20 MB，请使用完整编辑模式。'});return;}
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        notify('guagua-document-preview',{base64:btoa(binary)});
      }
      else if(message.cmd==='error'){saveRequested=false;showError(message.message);}
    };
  }).catch(showError);
  document.body.appendChild(script);
}
start().catch(showError);
