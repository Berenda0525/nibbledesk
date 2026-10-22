import {app,BrowserWindow} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {configureRuntimePaths} from '../desktop/runtime-paths.mjs';
import {createFileStore} from '../desktop/file-store.mjs';
import {startOfficeServer} from '../desktop/office-server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
app.setName('瓜瓜 Office 本地测试');configureRuntimePaths(app,{developmentDataDir:path.join(root,'.test-data','office-local')});
let server;
app.on('window-all-closed',async()=>{await server?.close();app.quit();});
app.whenReady().then(async()=>{
  const files=await createFileStore(app.getPath('userData'));
  server=await startOfficeServer({appDir:path.join(root,'dist'),runtimeDir:path.join(root,'resources','office-runtime'),files});
  globalThis.officeTest={server,files};
  const session=await server.openSession({kind:process.env.GUAGUA_OFFICE_KIND||'docx',scope:'agents/claude'});
  const window=new BrowserWindow({width:1200,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await window.loadURL(session.url);
}).catch(error=>{console.error(error);app.exit(1);});
