import {app,BrowserWindow,ipcMain,dialog,safeStorage,protocol,shell,nativeTheme,screen} from 'electron';
import {loadWindowBounds,rememberWindow} from './window-layout.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createFileStore} from './file-store.mjs';
import {createKeyStore} from './key-store.mjs';
import {configureRuntimePaths} from './runtime-paths.mjs';
import {createService,chatScope} from '../core/service.mjs';
import {startOfficeServer} from './office-server.mjs';
import {createDocumentManager} from './documents.mjs';
import {createHarnessRuntime} from './harness-runtime.mjs';
import {createSpeechEngine} from './speech.mjs';
import {createDesktopCompanion} from './companion.mjs';
import {createIslandChatController} from '../core/island-chat.mjs';
import {createVideoModule} from './modules/video/module.mjs';
import {createMusicModule} from './modules/music/module.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
let page;const nativeAbort=new AbortController();
const allow=new Set(['bootstrap','saveProvider','removeProvider','refreshModels','addModel','createChat','createAgent','updateChat','deleteChat','updateAgent','updateProfile','sendMessage','stopChat','importFiles','importFileData','saveArtifact','exportChat','openDocument','saveDocument','newDocument','closeDocument','resolveTaskApproval','transcribeAudio','cancelTranscription','getDesktopStatus','requestNotificationAccess','openNotificationSettings']);
for(const name of ['importPresentationTemplate','registerPresentationTemplate','cacheDocumentPreview','getUsage','saveModelPrice','syncUsage','setModalState','saveAnnotations','music:getState','music:mount','music:hide','music:reload'])allow.add(name);
const videoActions=new Set(['video:getState','video:open','video:action','video:updateSettings']);
for(const action of videoActions)allow.add(action);
protocol.registerSchemesAsPrivileged([{scheme:'star-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window,service,files,office,documents,taskRunner,speech,islandSpeech,companion,islandChat,video,music,musicStarting,modalOpen=false,currentProfile={},closing=false,didClose=false,cleanupStarted=false;
app.setName('瓜瓜');
let runtimeReady=true;
try{configureRuntimePaths(app,{developmentDataDir:path.join(here,'..','.local-data')});}catch(error){runtimeReady=false;dialog.showErrorBox('瓜瓜无法启动',error.message);app.exit(1);}
const hasInstanceLock=runtimeReady&&app.requestSingleInstanceLock();
if(!hasInstanceLock)app.quit();
if(process.platform==='win32')app.setAppUserModelId('local.guagua.desktop');
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.on('window-all-closed',()=>app.quit());
function finishQuit(){
  if(cleanupStarted)return;cleanupStarted=true;closing=true;nativeAbort.abort();speech?.dispose();islandSpeech?.dispose();
  Promise.race([Promise.allSettled([service?.close(),taskRunner?.dispose(),companion?.dispose(),video?.dispose(),music?.dispose()]),new Promise(resolve=>setTimeout(resolve,5000))]).catch(()=>{}).finally(()=>{office?.close().catch(()=>{});didClose=true;app.quit();});
}
app.on('before-quit',event=>{
  if(!service||didClose)return;
  event.preventDefault();if(closing)return;closing=true;
  if(window&&!window.isDestroyed())window.close();else finishQuit();
});

const safeFilename=value=>String(value||'对话记录').replace(/[\u0000-\u001f<>:"/\\|?*]/g,'_').slice(0,100);
async function scopeForChat(chatId){
  const state=await service.getState();const chat=state.chats.find(item=>item.id===chatId);
  if(!chat)throw new Error('请先选择一个对话，再添加文件');
  return chatScope(chat);
}
async function exportChat(chatId){
  const state=await service.getState();const chat=state.chats.find(item=>item.id===chatId);if(!chat)throw new Error('对话不存在');
  const result=await dialog.showSaveDialog(window,{title:'导出对话',defaultPath:safeFilename(chat.title)+'.md',filters:[{name:'Markdown 文档',extensions:['md']}]});
  if(result.canceled||!result.filePath)return {saved:false};
  const text=[`# ${chat.title}`,`导出时间：${new Date().toLocaleString('zh-CN')}`,...chat.messages.map(message=>{const author=message.role==='user'?'我':state.agents.find(item=>item.id===message.agentId)?.name||'系统';const attachments=(message.attachments||[]).map(item=>{const asset=typeof item==='string'?state.assets.find(a=>a.id===item):item;return asset?`附件：${asset.name}`:'';}).filter(Boolean).join('\n');return `## ${author}${message.model?` · ${message.model}`:''}\n\n${message.content||''}${message.error?`\n\n错误：${message.error}`:''}${attachments?`\n\n${attachments}`:''}`;})].join('\n\n');
  await fs.writeFile(result.filePath,text,'utf8');return {saved:true};
}

async function start(){
  const dataDir=app.getPath('userData');files=await createFileStore(dataDir);const keys=await createKeyStore(dataDir,safeStorage);
  taskRunner=createHarnessRuntime({dataDir});
  speech=createSpeechEngine({resourceDir:app.isPackaged?path.join(process.resourcesPath,'speech'):path.join(here,'../resources/speech'),tempDir:path.join(app.getPath('temp'),'voice')});
  islandSpeech=createSpeechEngine({resourceDir:app.isPackaged?path.join(process.resourcesPath,'speech'):path.join(here,'../resources/speech'),tempDir:path.join(app.getPath('temp'),'voice-island')});
  service=await createService({dataDir,keys,fileStore:files,taskRunner,emit:event=>{if(window&&!window.isDestroyed())window.webContents.send('stellar:event',event);islandChat?.handleEvent(event);}});
  islandChat=createIslandChatController({service,onSnapshot:snapshot=>companion?.publishChat(snapshot)});
  currentProfile=(await service.getState()).profile;
  const onSaved=async()=>{if(window&&!window.isDestroyed())window.webContents.send('stellar:event',{type:'state',state:await service.getState()});};
  office=await startOfficeServer({appDir:path.join(here,'../dist'),runtimeDir:app.isPackaged?path.join(process.resourcesPath,'office-runtime'):path.join(here,'../resources/office-runtime'),files,onSaved});
  page=office.appURL;documents=createDocumentManager({files,office,dataDir,onSaved});
  protocol.handle('star-asset',async request=>{
    try{const url=new URL(request.url);const id=url.pathname.slice(1);if(url.hostname!=='file'||! /^[a-f0-9-]{36}$/.test(id))return new Response('',{status:404});const item=await files.get(id);if(!item||item.type!=='image'||!['image/png','image/jpeg','image/webp','image/gif'].includes(item.mime))return new Response('',{status:404});const data=await fs.readFile(await files.resolve(id));return new Response(data,{headers:{'Content-Type':item.mime,'Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=86400','Content-Security-Policy':"default-src 'none'"}});}catch{return new Response('',{status:404});}
  });
  const applyTheme=theme=>{
    const light=theme==='light';const color=light?'#e9e9e9':'#272727';
    nativeTheme.themeSource=light?'light':'dark';
    window?.setBackgroundColor(color);
    window?.setTitleBarOverlay({color:modalOpen?(light?'#8c8c8c':'#171717'):color,symbolColor:modalOpen?(light?'#686868':'#777777'):(light?'#666666':'#bdbdbd'),height:32});
    if(process.platform==='win32')window?.setAccentColor(color);
    video?.setTheme(light?'light':'dark').catch(()=>{});
  };
  window=new BrowserWindow({...await loadWindowBounds(dataDir,screen),minWidth:780,minHeight:580,title:'瓜瓜',titleBarStyle:'hidden',titleBarOverlay:{color:'#272727',symbolColor:'#bdbdbd',height:32},icon:path.join(here,'assets/icon.ico'),backgroundColor:'#202020',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:false}});
  rememberWindow(window,dataDir);
  applyTheme(currentProfile.theme);
  window.on('close',event=>{if(!closing&&companion?.handleClose())event.preventDefault();});
  window.on('closed',finishQuit);
  window.on('page-title-updated',event=>{event.preventDefault();window.setTitle('瓜瓜');});
  const permittedClipboard=(contents,permission,url)=>{
    if(contents!==window.webContents||!window.isFocused())return false;
    if(permission==='clipboard-sanitized-write')return url===page||url?.startsWith(office.baseURL+'office/index.html?session=');
    return permission==='clipboard-read'&&url?.startsWith(office.baseURL+'office/index.html?session=');
  };
  const permittedMicrophone=(contents,permission,url,type)=>permission==='media'&&contents===window.webContents&&window.isFocused()&&url===page&&currentProfile.voice?.enabled===true&&type==='audio';
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(!!permittedClipboard(contents,permission,details.requestingUrl)||permittedMicrophone(contents,permission,details.requestingUrl,details.mediaTypes?.length===1?details.mediaTypes[0]:'')));
  window.webContents.session.setPermissionCheckHandler((contents,permission,_origin,details)=>!!permittedClipboard(contents,permission,details.requestingUrl)||permittedMicrophone(contents,permission,details.requestingUrl,details.mediaType));
  window.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(window,{type:'question',buttons:['返回编辑','放弃未保存修改并关闭'],defaultId:0,cancelId:0,title:'文档尚未保存',message:'有未保存的修改，是否返回编辑？'});if(choice===1)event.preventDefault();else closing=false;});
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))shell.openExternal(url).catch(()=>{});return {action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(url!==page){event.preventDefault();if(/^https:\/\//i.test(url))shell.openExternal(url).catch(()=>{});}});
  ipcMain.handle('stellar:call',async(event,action,payload={})=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!event.senderFrame.url.startsWith(page)||!allow.has(action))throw new Error('操作来源无效');
    if(payload===null||typeof payload!=='object'||Array.isArray(payload))throw new Error('操作参数无效');
    // 外部网页没有此桥；入口只接收公开播放器状态和受控动作。
    if(videoActions.has(action)){
      if(!video)throw new Error('影音模块正在初始化，请稍后重试');
      if(action==='video:getState')return video.getState();
      if(action==='video:open')return video.open(payload.platform);
      if(action==='video:action')return video.action(payload.name,payload.value);
      return video.updateSettings(payload);
    }
    if(action==='setModalState'){if(typeof payload.open!=='boolean')throw new Error('弹窗状态无效');modalOpen=payload.open;music?.setOccluded(modalOpen);applyTheme(currentProfile.theme);return {open:modalOpen};}
    if(action.startsWith('music:')){
      if(action==='music:hide')return music?.hide()||{mounted:false};
      musicStarting??=createMusicModule({mainWindow:window,root:app.isPackaged?path.join(process.resourcesPath,'folia-web'):path.join(here,'../resources/folia-web-1.5'),dataDir,onPlayback:value=>companion?.setMusicState(value)}).then(value=>{music=value;music.setOccluded(modalOpen);return value;}).catch(error=>{musicStarting=null;throw error;});
      const module=await musicStarting;if(action==='music:mount')return module.mount(payload.bounds);if(action==='music:reload')return module.reload();return module.getState();
    }
    if(action==='bootstrap')return {...await service.getState(),desktopStatus:companion?.getStatus(),speechStatus:await speech.status()};
    if(action==='updateProfile'){const state=await service.call(action,payload);currentProfile=state.profile;applyTheme(currentProfile.theme);await companion?.updateSettings();return {...state,desktopStatus:companion?.getStatus(),speechStatus:await speech.status()};}
    if(action==='getDesktopStatus')return companion?.getStatus()??{nativeAvailable:false};
    if(action==='requestNotificationAccess')return companion?.requestNotificationAccess();
    if(action==='openNotificationSettings')return companion?.openNotificationSettings();
    if(action==='transcribeAudio'){if(!currentProfile.voice?.enabled)throw new Error('请先在设置中开启本地语音输入');return speech.transcribe({...payload,language:currentProfile.voice.language});}
    if(action==='cancelTranscription'){speech.cancel();return {cancelled:true};}
    if(action==='importPresentationTemplate'){
      const selected=await dialog.showOpenDialog(window,{title:'导入 WPS / PowerPoint 模板',properties:['openFile'],filters:[{name:'PowerPoint 演示文稿',extensions:['pptx']}]});
      if(selected.canceled)return null;const [asset]=await files.importPaths(selected.filePaths,{scope:'agents/claude'});
      return service.call('registerPresentationTemplate',{id:asset.id});
    }
    if(action==='openDocument')return documents.open(payload);
    if(action==='cacheDocumentPreview')return documents.cachePreview(payload);
    if(action==='newDocument')return documents.create(payload);
    if(action==='saveDocument')return documents.save(payload);
    if(action==='saveAnnotations')return files.annotate(payload.id,payload);
    if(action==='closeDocument'){office.closeSession(payload.sessionId);return {closed:true};}
    if(action==='importFiles'){
      const scope=payload.scope??await scopeForChat(payload.chatId);
      const result=await dialog.showOpenDialog(window,{title:'添加文件',properties:['openFile','multiSelections'],filters:[{name:'图片、文档与文本',extensions:['png','jpg','jpeg','webp','gif','pdf','docx','xlsx','pptx','doc','xls','ppt','odt','ods','odp','txt','md','csv','json','js','jsx','ts','tsx','py','css','html','xml','yaml','yml','sql','log','srt']},{name:'所有文件',extensions:['*']}]});
      if(result.canceled)return [];const imported=await files.importPaths(result.filePaths,{scope});window.webContents.send('stellar:event',{type:'state',state:await service.getState()});return imported;
    }
    if(action==='saveArtifact'){
      const asset=await files.get(payload.id);if(!asset)throw new Error('文件不存在');const result=await dialog.showSaveDialog(window,{title:'保存文件',defaultPath:asset.name});if(result.canceled||!result.filePath)return {saved:false};await fs.copyFile(await files.resolve(asset.id),result.filePath);return {saved:true};
    }
    if(action==='exportChat')return exportChat(payload.chatId);
    return service.call(action,payload);
  });
  window.once('ready-to-show',()=>window.show());
  await window.loadURL(page);
  companion=await createDesktopCompanion({mainWindow:window,getVoiceSettings:()=>currentProfile.voice,onQuickFiles:async({agentId,files:incoming})=>{const state=await service.getState();if(!state.agents.some(a=>a.id===agentId))throw Error('助手无效');const rows=await service.call('importFileData',{scope:'agents/'+agentId,files:incoming});return rows.map(a=>({id:a.id,name:a.name,size:a.size,type:a.type}));},onQuickModel:payload=>islandChat.setModel(payload),onVoice:payload=>{if(!currentProfile.voice?.enabled)throw new Error('语音输入尚未开启');return islandSpeech.transcribe({...payload,language:currentProfile.voice.language});},onVoiceCancel:()=>islandSpeech.cancel(),getSettings:()=>currentProfile.desktop,getAgents:async()=>(await service.getState()).agents,iconPath:path.join(here,'assets/icon.ico'),onOpen:async({chatId}={})=>{
    if(chatId){const state=await service.getState();if(!state.chats.some(chat=>chat.id===chatId&&chat.entryPoint==='island'&&chat.type==='direct'))throw new Error('刘海会话不存在');}
    if(window.isMinimized())window.restore();window.show();window.focus();
    if(chatId)window.webContents.send('stellar:event',{type:'select-chat',chatId});
  },onQuit:()=>app.quit(),onStatus:status=>{if(!window.isDestroyed())window.webContents.send('stellar:event',{type:'desktop-status',status});},onChatState:payload=>islandChat.read(payload),onQuickChat:payload=>islandChat.send(payload),onQuickStop:payload=>islandChat.stop(payload),onNewQuickChat:payload=>islandChat.newChat(payload)});
  video=await createVideoModule({mainWindow:window,
    dataDir,cacheDir:path.dirname(app.getPath('sessionData')),iconPath:path.join(here,'assets/icon.ico'),
    getSuppression:()=>companion?companion.getStatus().suppressed:'detector-unavailable',
    theme:currentProfile.theme,
    onState:state=>{if(!window.isDestroyed())window.webContents.send('stellar:event',{type:'video-state',state});}
  });
}

if(hasInstanceLock)app.whenReady().then(start).catch(error=>{dialog.showErrorBox('瓜瓜启动失败',String(error.message||error).slice(0,600));app.quit();});
