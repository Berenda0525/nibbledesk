import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dataDir=await fs.mkdtemp(path.join(root,'.test-data/workspace-1.6-')),env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];
try{
 app=await electron.launch({args:[root],env,timeout:60000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.getByLabel('APImart API Key').fill('workspace-local-fixture');await page.getByRole('button',{name:'继续',exact:true}).click();await page.getByRole('button',{name:'跳过，进入聊天',exact:true}).click();
 const resize=async width=>{await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/app/')).setSize(width,691),width);await page.waitForFunction(()=>document.querySelector('.workspace').getBoundingClientRect().height>300);};
 const visible=async()=>{const b=await page.locator('.workspace').boundingBox(),s=await page.locator('.conversation-sidebar').boundingBox();assert.ok(b.x+s.width<2000);assert.ok(b.y<100&&b.height>400&&b.width>200,JSON.stringify(b));assert.ok(s.x>50&&s.x<100&&s.y<100,JSON.stringify(s));};
 for(const width of [1035,780,900,1035]){await resize(width);await visible();}
 const assets=await page.evaluate(files=>window.stellar.call('importFileData',{files,scope:'agents/claude'}),['一.md','二.md'].map(name=>({name,base64:Buffer.from('# '+name+'\n\n文件内容').toString('base64')})));
 await page.getByRole('button',{name:'文件',exact:true}).click();await resize(780);await visible();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.glass-folder-grid')).gridTemplateColumns.split(' ').length===1);
 const faces=await page.locator('.glass-folder-face').all();for(const face of faces){const b=await face.boundingBox();assert.ok(b.height>=60&&b.width>200);}
 await page.getByRole('button',{name:'打开 Claude 文件夹，2 个文件'}).click();await page.getByRole('button',{name:'打开 一.md',exact:true}).click();await page.getByLabel('阅读：一.md').waitFor();await page.getByRole('button',{name:'添加批注',exact:true}).click();await page.getByLabel('批注内容').fill('切换后恢复这段草稿');
 await page.getByRole('button',{name:'打开 二.md',exact:true}).click();await page.getByLabel('阅读：二.md').waitFor();await page.getByRole('button',{name:'打开 一.md',exact:true}).click();await page.getByLabel('阅读：一.md').waitFor();assert.equal(await page.getByLabel('批注内容').inputValue(),'切换后恢复这段草稿');
 for(const width of [780,1035,850]){await resize(width);await visible();const b=await page.locator('.document-dock').boundingBox();assert.ok(b.x+b.width<=width+2,JSON.stringify(b));}
 await page.screenshot({path:path.join(dataDir,'narrow-reading.png')});await page.getByRole('button',{name:'保存批注',exact:true}).click();assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,dataDir,checks:['resize','drawer-folders','direct-switch','annotation-draft','split-bounds'],errors}));
}finally{await app?.close();}
