import {app,BrowserWindow,Tray,Menu,ipcMain,screen,nativeImage,shell} from 'electron';
import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {normalizeDesktopSettings,overlaySuppression,islandGeometry,islandHitTest,createIslandHover,normalizeAgents,validateQuickInput,normalizeChatSnapshot,validateQuickFiles,normalizeMusicState} from './companion-policy.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export async function createDesktopCompanion({mainWindow,getSettings,getAgents=()=>[],getVoiceSettings=()=>({enabled:false}),onQuickFiles=async()=>[],onQuickModel=async()=>{},onVoice=async()=>{},onVoiceCancel=()=>{},onChatState=async({agentId})=>({agentId,messages:[]}),onQuickChat=async()=>{throw new Error('快聊暂未连接');},onQuickStop=async()=>{},onNewQuickChat=async({agentId})=>({agentId,messages:[]}),onOpen=()=>{},onQuit=()=>app.quit(),onStatus=()=>{},iconPath=path.join(here,'assets/icon.ico'),nativeRunner,cursorProvider=()=>screen.getCursorScreenPoint()}={}){
  if(!mainWindow||typeof getSettings!=='function')throw new Error('桌面助手初始化参数不完整');
  const helper=app.isPackaged?path.join(process.resourcesPath,'native','GuaguaDesktopBridge.exe'):path.join(here,'native','GuaguaDesktopBridge.exe');
  const notificationHelper=app.isPackaged?path.join(process.resourcesPath,'native','GuaguaNotifications.exe'):path.join(here,'native','GuaguaNotifications.exe');
  let settings=normalizeDesktopSettings(await getSettings()),probe={available:false},disposed=false,child,monitorTimer,notificationTimer,notificationExpires,notificationBusy=false,notificationBaseline=false,activeNotification=null,notificationGeneration=0;
  let musicState=null,lastForeground=null;
  let geometry,primaryDisplayId,ignored=true,agents=[],selectedAgentId='',lastStatus='',probeBusy=false,focusedForInput=false;
  const hover=createIslandHover(),chats=new Map(),pendingAgents=new Set(),notificationIds=new Set(),commands=new Set();
  const file=path.join(here,'companion','index.html'),pageURL=pathToFileURL(file).href+'?mode=island';
  let notificationStatus={status:'unavailable',message:'通知展示已关闭。开启后，仅显示微信与飞书的新系统通知。'};
  const island=new BrowserWindow({width:468,height:490,frame:false,transparent:true,thickFrame:false,hasShadow:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,show:false,backgroundColor:'#00000000',title:'瓜瓜桌面刘海',webPreferences:{preload:path.join(here,'companion','preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false,partition:'persist:guagua-island'}});
  island.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===island.webContents&&island.isFocused()&&getVoiceSettings().enabled===true&&permission==='media'&&details.requestingUrl===pageURL&&details.mediaTypes?.length===1&&details.mediaTypes[0]==='audio'));
  island.webContents.session.setPermissionCheckHandler((contents,permission,_origin,details)=>contents===island.webContents&&island.isFocused()&&getVoiceSettings().enabled===true&&permission==='media'&&details.mediaType==='audio'&&details.requestingUrl===pageURL);
  island.setAlwaysOnTop(true,'screen-saver');island.setMenu(null);island.setIgnoreMouseEvents(true,{forward:true});
  island.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  island.webContents.on('will-navigate',event=>event.preventDefault());
  const send=state=>{if(!disposed&&!island.isDestroyed()&&!island.webContents.isLoading())island.webContents.send('guagua:companion-state',state);};
  const status=()=>({islandEnabled:settings.islandEnabled,notificationsEnabled:settings.notificationsEnabled,nativeAvailable:!!probe.available,suppressed:overlaySuppression(settings,probe),notifications:notificationStatus,expanded:hover.expanded,islandVisible:!island.isDestroyed()&&island.isVisible(),primaryDisplayId});
  const publish=()=>{if(disposed)return;const value=status(),serialized=JSON.stringify(value);if(serialized!==lastStatus){lastStatus=serialized;try{onStatus(value);}catch{}}};
  const setIgnored=value=>{if(ignored!==value&&!island.isDestroyed()){ignored=value;island.setIgnoreMouseEvents(value,{forward:true});}};
  function releaseFocus(){
    if(island.isDestroyed())return;const wasFocused=island.isFocused();focusedForInput=false;island.setFocusable(false);island.blur();
    // Windows 可能继续激活已改为不可聚焦的透明窗口；不激活地重显以释放键盘。
    if(wasFocused&&island.isVisible()&&!overlaySuppression(settings,probe)&&settings.islandEnabled){island.hide();island.showInactive();}
    send({releaseFocus:true});
  }
  function setExpanded(value){
    if(value===hover.expanded)return;
    hover.set(value);if(!value)releaseFocus();send({expanded:value});publish();
    if(value)refreshAgents().catch(()=>{});
  }
  function alignIsland(){
    if(disposed||island.isDestroyed())return;
    const display=screen.getPrimaryDisplay();primaryDisplayId=display.id;geometry=islandGeometry(display);
    const {x,y,width,height}=geometry;const current=island.getBounds();
    if(current.x!==x||current.y!==y||current.width!==width||current.height!==height)island.setBounds({x,y,width,height},false);
    // Windows rounds DIP sizes at fractional scaling; center the realized size.
    const measured=island.getBounds(),centeredX=Math.round(display.bounds.x+(display.bounds.width-measured.width)/2);
    if(measured.x!==centeredX)island.setPosition(centeredX,y,false);
    const actual=island.getBounds();geometry={...geometry,...actual,surfaceWidth:actual.width-36,surfaceHeight:actual.height-24};
    send({geometry});
  }
  function sync(){
    if(disposed||island.isDestroyed())return;
    const blocked=overlaySuppression(settings,probe);
    if(blocked||!settings.islandEnabled||mainWindow.isDestroyed()){
      setExpanded(false);releaseFocus();setIgnored(true);island.hide();
      if(blocked&&activeNotification){activeNotification=null;send({notification:null});}
    }else if(!island.isVisible()){alignIsland();island.showInactive();}
    if(!blocked&&settings.islandEnabled&&island.isVisible()&&probe.foregroundId!==lastForeground){island.moveTop();lastForeground=probe.foregroundId;}
    publish();
  }
  function pointerTick(){
    if(disposed||island.isDestroyed()||!island.isVisible()||overlaySuppression(settings,probe)||!settings.islandEnabled)return;
    let point;try{point=cursorProvider();}catch{return;}
    const inside=islandHitTest(point,geometry,hover.expanded),before=hover.expanded;
    setIgnored(!inside);
    const expanded=hover.update(inside,Date.now());
    if(before!==expanded){if(!expanded)releaseFocus();send({expanded});publish();if(expanded)refreshAgents().catch(()=>{});}
  }
  async function refreshAgents(){
    const next=normalizeAgents(await getAgents());if(disposed)return;
    agents=next;if(!agents.some(agent=>agent.id===selectedAgentId))selectedAgentId=agents[0]?.id||'';
    for(const id of chats.keys())if(!agents.some(agent=>agent.id===id))chats.delete(id);
    send({music:musicState,agents,selectedAgentId});
  }
  function publishChat(input){
    if(disposed)return;
    const snapshot=normalizeChatSnapshot(input,agents);chats.set(snapshot.agentId,snapshot);send({chat:snapshot});return snapshot;
  }
  async function open({chatId}={}){
    if(disposed||mainWindow.isDestroyed())return;
    if(chatId&&!Array.from(chats.values()).some(chat=>chat.chatId===chatId))throw new Error('快聊会话无效');
    setExpanded(false);await onOpen(chatId?{chatId}:{});
  }
  const tray=new Tray(nativeImage.createFromPath(iconPath));tray.setToolTip('瓜瓜');
  tray.on('double-click',()=>open().catch(()=>{}));tray.on('click',()=>open().catch(()=>{}));
  tray.setContextMenu(Menu.buildFromTemplate([{label:'打开工作台',click:()=>open().catch(()=>{})},{type:'separator'},{label:'退出瓜瓜',click:()=>onQuit()}]));
  const command=(executable,mode,timeout)=>new Promise((resolve,reject)=>{
    const process=execFile(executable,[mode],{windowsHide:true,timeout,maxBuffer:262144,encoding:'utf8'},(error,stdout)=>{commands.delete(process);if(error)return reject(error);try{resolve(JSON.parse(stdout.trim()));}catch{reject(new Error('桌面状态读取失败'));}});commands.add(process);
  });
  const runNative=(mode,timeout=2200)=>nativeRunner?nativeRunner(mode):command(helper,mode,timeout);
  const runNotifications=mode=>nativeRunner?nativeRunner('notification-'+mode):command(notificationHelper,mode,mode==='request'?120000:5000);
  const setNotificationStatus=result=>{notificationStatus={status:['available','denied','unavailable'].includes(result?.status)?result.status:'unavailable',message:typeof result?.message==='string'?result.message.slice(0,300):'当前 Windows 未提供通知访问能力。'};};
  async function pollNotifications(){
    if(disposed||!settings.notificationsEnabled||notificationBusy)return;notificationBusy=true;
    const generation=notificationGeneration;
    try{
      const result=await runNotifications('list');if(disposed||!settings.notificationsEnabled||generation!==notificationGeneration)return;setNotificationStatus(result);
      const items=Array.isArray(result.items)?result.items.slice(-100):[];let newest=null;
      for(const item of items){
        if(!item||typeof item.id!=='string'||typeof item.app!=='string')continue;
        const id=`${item.app}:${item.id}:${item.created}`;
        if(notificationBaseline&&!notificationIds.has(id)&&/wechat|weixin|微信|feishu|lark|飞书/i.test(item.app))newest=item;
        notificationIds.add(id);
      }
      if(notificationIds.size>1000){notificationIds.clear();for(const item of items)notificationIds.add(`${item.app}:${item.id}:${item.created}`);}
      notificationBaseline=result.status==='available';
      if(newest&&!overlaySuppression(settings,probe)&&settings.islandEnabled){
        activeNotification={app:newest.app.slice(0,80),title:String(newest.title||'新通知').slice(0,200),body:String(newest.body||'').slice(0,1000)};
        send({notification:activeNotification});clearTimeout(notificationExpires);notificationExpires=setTimeout(()=>{activeNotification=null;send({notification:null});},10000);
      }
    }catch{if(!disposed&&settings.notificationsEnabled&&generation===notificationGeneration)notificationStatus={status:'unavailable',message:'Windows 通知连接暂不可用。可重新请求权限或检查系统通知设置。'};}
    finally{notificationBusy=false;sync();}
  }
  async function refreshProbe(){
    if(probeBusy)return probe;probeBusy=true;
    try{probe=await runNative('probe');}catch{probe={available:false};}finally{probeBusy=false;}
    sync();return probe;
  }
  function requireAgent(payload){if(!payload||typeof payload!=='object'||!agents.some(agent=>agent.id===payload.agentId))throw new Error('请选择一个助手');return payload.agentId;}
  const trusted=event=>event.sender===island.webContents&&event.senderFrame===event.sender.mainFrame&&event.senderFrame?.url===pageURL;
  const allowed=new Set(['status','open','collapse','expand','activate-input','typing','voice-begin','chat-state','quick-send','quick-files','quick-stop','quick-new','quick-model','quick-voice','quick-voice-cancel']);
  const handler=async(event,action,payload={})=>{
    if(!trusted(event)||!allowed.has(action))throw new Error('操作来源无效');
    if(action==='status')return {...status(),geometry,agents,selectedAgentId,chats:[...chats.values()],notification:activeNotification};
    if(action==='collapse'){setExpanded(false);return {expanded:false};}
    if(action==='quick-voice-cancel'){hover.release();onVoiceCancel();return {cancelled:true};}
    if(action==='typing'){if(focusedForInput)hover.hold(Date.now());return {ok:true};}
    if(action==='quick-stop'){const agentId=requireAgent(payload),chat=chats.get(agentId);await onQuickStop({agentId,chatId:chat?.chatId??null});return {stopped:true};}
    if(!settings.islandEnabled||overlaySuppression(settings,probe))throw new Error('桌面刘海当前已暂停');
    if(action==='expand'){setExpanded(true);return {expanded:true};}
    if(action==='activate-input'){
      await refreshProbe();if(overlaySuppression(settings,probe)||!hover.expanded)throw new Error('桌面刘海当前已暂停');
      focusedForInput=true;island.setFocusable(true);island.focus();hover.hold(Date.now());return {active:true};
    }
    if(action==='open'){await open({chatId:payload?.chatId});return {opened:true};}
    if(action==='voice-begin'||action==='quick-voice'){if(!getVoiceSettings().enabled||!island.isFocused()||!hover.expanded)throw new Error('请先在设置开启语音输入，再点击麦克风');hover.hold(Date.now(),130000);if(action==='voice-begin')return {active:true};try{return await onVoice(payload);}finally{hover.release();}}
    const agentId=requireAgent(payload);selectedAgentId=agentId;
    if(action==='quick-files'){return onQuickFiles(validateQuickFiles(payload,agents));}
    if(action==='quick-model'){const result=await onQuickModel({agentId,model:payload.model});await refreshAgents();return publishChat(result);}
    if(action==='chat-state'){return publishChat(await onChatState({agentId,chatId:chats.get(agentId)?.chatId??null}));}
    if(pendingAgents.has(agentId)||chats.get(agentId)?.running)throw new Error('这个助手仍在回复，请先等待或停止');
    pendingAgents.add(agentId);
    try{
      if(action==='quick-new')return publishChat(await onNewQuickChat({agentId}));
      const request=validateQuickInput(payload,agents);
      await refreshProbe();if(!settings.islandEnabled||overlaySuppression(settings,probe))throw new Error('桌面刘海当前已暂停');
      return publishChat(await onQuickChat({...request,chatId:chats.get(agentId)?.chatId??null}));
    }finally{pendingAgents.delete(agentId);}
  };
  ipcMain.handle('guagua:companion',handler);
  await island.loadFile(file,{query:{mode:'island'}});
  async function updateSettings(){
    const previousNotifications=settings.notificationsEnabled;settings=normalizeDesktopSettings(await getSettings());
    if(previousNotifications!==settings.notificationsEnabled)notificationGeneration++;
    if(settings.notificationsEnabled&&!notificationTimer){notificationBaseline=false;notificationIds.clear();notificationTimer=setInterval(()=>pollNotifications(),5000);pollNotifications();}
    if(!settings.notificationsEnabled){clearInterval(notificationTimer);notificationTimer=null;notificationBaseline=false;notificationIds.clear();activeNotification=null;clearTimeout(notificationExpires);send({notification:null});if(previousNotifications)notificationStatus={status:'unavailable',message:'通知展示已关闭。'};}
    await refreshAgents();sync();return status();
  }
  function startWatcher(){
    if(nativeRunner){monitorTimer=setInterval(()=>refreshProbe(),300);return;}
    child=spawn(helper,['watch'],{windowsHide:true,stdio:['pipe','pipe','ignore']});let buffer='',lastHeartbeat=Date.now();
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      buffer+=chunk;if(buffer.length>20000){buffer='';probe={available:false};sync();return;}
      let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);try{probe=JSON.parse(line);lastHeartbeat=Date.now();sync();}catch{}}
    });
    monitorTimer=setInterval(()=>{if(Date.now()-lastHeartbeat>3000){probe={available:false};sync();}},1000);
    child.on('error',()=>{probe={available:false};sync();});child.on('exit',()=>{probe={available:false};sync();});
  }
  const displayListener=()=>{alignIsland();sync();},mainClosed=()=>sync();
  for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,displayListener);
  mainWindow.on('closed',mainClosed);
  island.on('blur',()=>{focusedForInput=false;island.setFocusable(false);send({releaseFocus:true});});
  alignIsland();startWatcher();await updateSettings();
  const pointerTimer=setInterval(pointerTick,50);
  return {
    handleClose(){if(disposed||!settings.islandEnabled||!settings.closeToIsland)return false;mainWindow.hide();sync();return true;},
    updateSettings,getStatus:status,publishChat,
    setMusicState(value){musicState=normalizeMusicState(value);send({music:musicState});},
    async requestNotificationAccess(){try{setNotificationStatus(await runNotifications('request'));}catch{notificationStatus={status:'unavailable',message:'Windows 未完成通知授权。此安装方式可能不支持系统通知监听。'};}publish();if(settings.notificationsEnabled)pollNotifications();return notificationStatus;},
    async openNotificationSettings(){await shell.openExternal('ms-settings:privacy-notifications');return notificationStatus;},
    async dispose(){
      if(disposed)return;disposed=true;clearTimeout(notificationExpires);clearInterval(monitorTimer);clearInterval(notificationTimer);clearInterval(pointerTimer);
      for(const name of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(name,displayListener);
      mainWindow.removeListener('closed',mainClosed);ipcMain.removeHandler('guagua:companion');
      if(child){child.stdin.end();child.kill();}for(const process of commands)process.kill();tray.destroy();if(!island.isDestroyed())island.destroy();activeNotification=null;notificationIds.clear();chats.clear();
    }
  };
}
