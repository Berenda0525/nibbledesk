const {contextBridge,ipcRenderer}=require('electron');
const actions=new Set(['bootstrap','saveProvider','removeProvider','refreshModels','addModel','createChat','createAgent','updateChat','deleteChat','updateAgent','updateProfile','sendMessage','stopChat','importFiles','importFileData','saveArtifact','exportChat','openDocument','saveDocument','newDocument','closeDocument','resolveTaskApproval','transcribeAudio','cancelTranscription','getDesktopStatus','requestNotificationAccess','openNotificationSettings']);
for(const action of ['importPresentationTemplate','registerPresentationTemplate','cacheDocumentPreview','getUsage','saveModelPrice','syncUsage','setModalState','saveAnnotations','music:getState','music:mount','music:hide','music:reload','video:getState','video:open','video:action','video:updateSettings'])actions.add(action);
contextBridge.exposeInMainWorld('stellar',Object.freeze({
  call(action,payload={}){if(!actions.has(action))return Promise.reject(new Error('不支持的操作'));return ipcRenderer.invoke('stellar:call',action,payload);},
  onEvent(callback){if(typeof callback!=='function')throw new TypeError('事件处理器必须是函数');const listener=(_event,value)=>callback(value);ipcRenderer.on('stellar:event',listener);return()=>ipcRenderer.removeListener('stellar:event',listener);}
}));
