const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['status','open','collapse','expand','activate-input','typing','voice-begin','chat-state','quick-send','quick-files','quick-stop','quick-new','quick-model','quick-voice','quick-voice-cancel']);
contextBridge.exposeInMainWorld('companion',Object.freeze({
  call(action,payload={}){if(!allowed.has(action))return Promise.reject(new Error('操作无效'));return ipcRenderer.invoke('guagua:companion',action,payload);},
  onState(callback){if(typeof callback!=='function')return()=>{};const listener=(_event,state)=>callback(state);ipcRenderer.on('guagua:companion-state',listener);return()=>ipcRenderer.removeListener('guagua:companion-state',listener);}
}));
