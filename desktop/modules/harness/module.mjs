import {WebContentsView,session,shell} from 'electron';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startHarnessProxy,harnessProviders} from '../../../core/harness-proxy.mjs';
import {providerDefinitions} from '../../../core/provider-config.mjs';
import {childEnvironment,terminateOwnedProcess} from '../../../core/task-policy.mjs';
const require=createRequire(import.meta.url);

/** 内置原生 Web profile，保留上游预设、工具、审批、会话与设置。 */
export async function createNativeHarness({mainWindow,dataDir,keys,getState,onUsage,nodeExecutable=process.execPath,signal}){
 const root=path.join(dataDir,'modules/harness'),home=path.join(root,'home'),workspace=path.join(root,'workspace');
 await fs.mkdir(home,{recursive:true});await fs.mkdir(workspace,{recursive:true});await fs.mkdir(path.join(root,'temp'),{recursive:true});
 const proxy=await startHarnessProxy({getState,keys,onUsage,definitions:s=>providerDefinitions(s.providerConfigs)});
 let child,view,mounted=false,occluded=false,disposed=false,origin;const abort=()=>{if(child)void terminateOwnedProcess(child);};signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();const state=await getState(),catalog=harnessProviders(state,providerDefinitions(state.providerConfigs),proxy.origin);
  if(!catalog.selection)throw Error('请先在瓜瓜配置至少一个聊天模型服务');
  const patch=[{id:'llm-deepseek',disabled:true},{id:'agent-default-model',config:catalog.selection},{insert:[{id:'guagua-native-providers',name:'@deepseek-ai/dsh-llm-pi-ai',config:{providers:catalog.providers}}]}];
  const patchFile=path.join(home,'guagua-models.patch.json');await fs.writeFile(patchFile,JSON.stringify(patch));
  const env={...childEnvironment(path.join(root,'temp')),PATH:process.env.PATH,ELECTRON_RUN_AS_NODE:'1',DSH_HOME:home,DSH_TELEMETRY_MODE:'DISABLED',DSH_TELEMETRY_DISABLED:'1',GUAGUA_HARNESS_ACCESS:proxy.token};
  child=spawn(nodeExecutable,[require.resolve('@deepseek-ai/dsh/lib/bin.js'),'--profile','web','--patch',patchFile,'--no-open','--host','127.0.0.1','--port','0'],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  if(signal?.aborted){await terminateOwnedProcess(child);throw Error('Harness 启动已取消');}const url=await new Promise((resolve,reject)=>{let output='',diagnostic='';const timer=setTimeout(()=>reject(Error('原生 Harness 初始化超时，请重试')),120000);
   const fail=message=>{clearTimeout(timer);reject(Error(message));};
   child.once('error',()=>fail('无法启动内置 Harness 运行时'));child.once('exit',code=>fail('Harness 初始化未完成（'+code+'）：'+diagnostic.replace(/https?:\/\/\S+/g,'[服务地址]').slice(-500)));
   child.stderr.on('data',c=>{diagnostic=(diagnostic+c.toString()).slice(-4000);});child.stdout.on('data',c=>{output=(output+c.toString()).slice(-16000);const match=output.match(/dsh web:\s*(http:\/\/127\.0\.0\.1:\d+\/\S*)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  signal?.throwIfAborted();origin=new URL(url).origin;
  view=new WebContentsView({webPreferences:{session:session.fromPath(path.join(root,'browser-session')),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false}});
  view.webContents.session.setPermissionRequestHandler((_contents,permission,callback)=>callback(permission==='clipboard-sanitized-write'));
  view.webContents.session.setPermissionCheckHandler((_contents,permission)=>permission==='clipboard-sanitized-write');
  view.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))shell.openExternal(url).catch(()=>{});return {action:'deny'};});
  view.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  mainWindow.contentView.addChildView(view);view.setVisible(false);await view.webContents.loadURL(url);
 }catch(e){if(child)await terminateOwnedProcess(child);if(view&&!view.webContents.isDestroyed())view.webContents.close();await proxy.close();throw e;}
 const show=()=>{if(!disposed)view.setVisible(mounted&&!occluded);};
 return {getState:()=>({ready:!disposed&&child.exitCode===null,profile:'web',version:'0.2.0-rc.2'}),
  mount(bounds){const [width,height]=mainWindow.getContentSize();const b=Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.round(Number(bounds?.[k]))]));if(Object.values(b).some(n=>!Number.isFinite(n))||b.x<0||b.y<32||b.width<1||b.height<1||b.x+b.width>width+1||b.y+b.height>height+1)throw Error('Harness 视图位置无效');view.setBounds(b);mounted=true;show();return {mounted:true};},
  hide(){mounted=false;show();return {mounted:false};},setOccluded(value){occluded=!!value;show();},reload(){view.webContents.reload();return {ready:true};},
  async dispose(){if(disposed)return;disposed=true;signal?.removeEventListener('abort',abort);mainWindow.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close();await terminateOwnedProcess(child);await proxy.close();}
 };
}
