import {WebContentsView,session,shell,ipcMain} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeMusicState} from '../../companion-policy.mjs';
import {startMusicServer} from './server.mjs';

/** 顶层音乐网页保留原生文件夹选择能力，并与聊天使用独立会话。 */
export async function createMusicModule({mainWindow,root,dataDir,onPlayback=()=>{}}){
 const server=await startMusicServer({root,dataDir,parentOrigin:'http://127.0.0.1:*'});
 const musicSession=session.fromPath(path.join(dataDir,'modules/music/session'),{cache:true});
 const view=new WebContentsView({webPreferences:{preload:fileURLToPath(new URL('./preload.cjs',import.meta.url)),session:musicSession,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,autoplayPolicy:'document-user-activation-required'}});
 const trusted=contents=>contents===view.webContents&&contents.getURL().startsWith(server.origin+'/');
 musicSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(trusted(contents)&&(['persistent-storage','mediaKeySystem'].includes(permission)||permission==='fileSystem'&&details.fileAccessType==='readable')));
 musicSession.setPermissionCheckHandler((contents,permission,origin,details)=>trusted(contents)&&origin===server.origin&&(['persistent-storage','mediaKeySystem'].includes(permission)||permission==='fileSystem'&&details.fileAccessType==='readable'));
 view.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))shell.openExternal(url).catch(()=>{});return {action:'deny'};});
 view.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(server.origin+'/'))event.preventDefault();});
 let lastPlayback=0;const playback=(event,value)=>{if(event.sender!==view.webContents||event.senderFrame!==view.webContents.mainFrame||!trusted(event.sender)||Date.now()-lastPlayback<90)return;lastPlayback=Date.now();onPlayback(normalizeMusicState(value));};ipcMain.on('guagua-music:playback',playback);
 mainWindow.contentView.addChildView(view);view.setVisible(false);
 let mounted=false,occluded=false,disposed=false;
 try{await view.webContents.loadURL(server.url);}catch(e){ipcMain.removeListener('guagua-music:playback',playback);mainWindow.contentView.removeChildView(view);view.webContents.close();await server.close();throw e;}
 const show=()=>{if(!disposed)view.setVisible(mounted&&!occluded);};
 return {
  getState:()=>({ready:true,version:'0.7.21'}),
  mount(bounds){
   if(disposed)throw new Error('音乐模块已关闭');const [width,height]=mainWindow.getContentSize();
   const b=Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round(Number(bounds?.[k]))]));
   if(Object.values(b).some(n=>!Number.isFinite(n))||b.x<0||b.y<32||b.width<1||b.height<1||b.x+b.width>width+1||b.y+b.height>height+1)throw new Error('音乐视图位置无效');
   view.setBounds(b);mounted=true;show();return {mounted:true};
  },
  hide(){mounted=false;show();return {mounted:false};},
  setOccluded(value){occluded=!!value;show();},
  async reload(){await view.webContents.reload();return {ready:true};},
  async dispose(){if(disposed)return;disposed=true;ipcMain.removeListener('guagua-music:playback',playback);onPlayback(null);mainWindow.contentView.removeChildView(view);view.webContents.close();await server.close();}
 };
}
