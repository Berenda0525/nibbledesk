import {app,BrowserWindow} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {configureRuntimePaths} from '../desktop/runtime-paths.mjs';
import {createDesktopCompanion} from '../desktop/companion.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
configureRuntimePaths(app,{developmentDataDir:process.env.STAR_CHAT_TEST_DATA_DIR});
let companion,closing=false;
const timers=new Set();
app.on('before-quit',event=>{if(closing)return;event.preventDefault();closing=true;for(const timer of timers)clearInterval(timer);Promise.resolve(companion?.dispose()).finally(()=>app.quit());});
app.whenReady().then(async()=>{
  const mainWindow=new BrowserWindow({width:620,height:390,show:false,title:'瓜瓜刘海交互测试',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await mainWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<title>瓜瓜刘海交互测试</title><body style="background:#272727;color:#ddd;font:17px sans-serif;padding:35px">仅用于桌面刘海交互验收，不调用网络模型。</body>'));
  const agents=['claude','gpt','gemini','deepseek','kimi','doubao'].map((id,i)=>({id,name:['Claude','GPT','Gemini','DeepSeek','Kimi','豆包'][i],model:'本地测试模型'}));
  const state={settings:{},probe:{available:true,notificationState:5,fullscreen:false},cursor:{x:0,y:600},nativeCalls:[],opened:[],stopped:[],submitted:[],notifications:[],chats:new Map(),active:new Map()};
  const snapshot=id=>({...state.chats.get(id),agentId:id,chatId:state.chats.get(id)?.chatId||null,messages:state.chats.get(id)?.messages||[],running:!!state.chats.get(id)?.running,model:state.chats.get(id)?.model||'本地测试模型',voiceEnabled:true,models:[{id:'本地测试模型',name:'本地测试模型'},{id:'model-next',name:'另一个测试版本'}]});
  companion=await createDesktopCompanion({mainWindow,iconPath:path.join(project,'desktop/assets/icon.ico'),getSettings:()=>state.settings,getAgents:()=>agents,getVoiceSettings:()=>({enabled:true}),onVoice:payload=>{state.voice=payload;return {text:'语音草稿测试'};},onQuickModel:({agentId,model})=>{state.chats.set(agentId,{...snapshot(agentId),model});return snapshot(agentId);},cursorProvider:process.env.ISLAND_NATIVE_POINTER==='1'?undefined:()=>state.cursor,
    nativeRunner:async mode=>{state.nativeCalls.push(mode);if(mode==='probe')return state.probe;if(mode.startsWith('notification-'))return {status:'available',message:'本地测试状态',items:state.notifications};throw Error('Unexpected native command: '+mode);},
    onChatState:({agentId})=>snapshot(agentId),
    onQuickChat:({agentId,text})=>{
      if(state.chats.get(agentId)?.running)throw Error('正在回复');
      state.submitted.push({agentId,text});const previous=snapshot(agentId);
      const chat={...previous,chatId:previous.chatId||'quick-'+agentId,messages:[...previous.messages,{id:'u-'+Date.now(),role:'user',content:text},{id:'a-'+Date.now(),role:'assistant',content:''}],running:true,error:''};state.chats.set(agentId,chat);
      const chunks=['你好！','这是流式快聊的本地测试。','\n<script>window.injectionExecuted=true</script>'];let index=0;
      const timer=setInterval(()=>{chat.messages.at(-1).content+=chunks[index++];if(index>=chunks.length){clearInterval(timer);timers.delete(timer);state.active.delete(agentId);chat.running=false;}companion.publishChat({...chat,messages:chat.messages.map(message=>({...message}))});},250);
      timers.add(timer);state.active.set(agentId,timer);return {...chat,messages:chat.messages.map(message=>({...message}))};
    },
    onQuickStop:({agentId})=>{state.stopped.push(agentId);const timer=state.active.get(agentId);clearInterval(timer);timers.delete(timer);state.active.delete(agentId);const chat=state.chats.get(agentId);if(chat){chat.running=false;companion.publishChat(chat);}},
    onNewQuickChat:({agentId})=>{const chat={agentId,chatId:'new-'+agentId+'-'+Date.now(),messages:[],running:false,model:'本地测试模型'};state.chats.set(agentId,chat);return chat;},
    onOpen:payload=>{state.opened.push(payload);mainWindow.show();mainWindow.focus();}
  });
  const nativeProbe=async()=>{const {stdout}=await promisify(execFile)(path.join(project,'desktop/native/GuaguaDesktopBridge.exe'),['probe'],{windowsHide:true,timeout:5000,encoding:'utf8'});return JSON.parse(stdout.trim());};
  globalThis.companionTest={companion,state,nativeProbe,mainId:mainWindow.id};
}).catch(error=>{console.error(error);app.exit(1);});
