const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('guaguaMusic',Object.freeze({publish(value){ipcRenderer.send('guagua-music:playback',value);}}));
