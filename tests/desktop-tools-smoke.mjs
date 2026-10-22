import {_electron as electron,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();await fs.mkdir('.test-data',{recursive:true});const dataDir=await fs.mkdtemp(path.resolve('.test-data/desktop-tools-'));
const env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
const result={passed:false,checks:[],errors:[],paidRequests:0,dataDir};let app;
try{
 app=await electron.launch({args:[root],env,timeout:60000});const page=await app.firstWindow();page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')dialog.dismiss().catch(()=>{});});page.on('pageerror',e=>result.errors.push(e.message));await page.waitForFunction(()=>window.stellar?.call);
 const call=(action,payload={})=>page.evaluate(async({action,payload})=>window.stellar.call(action,payload),{action,payload});
 await page.getByLabel('APImart API Key').fill('desktop-integration-test-only');await page.getByRole('button',{name:'继续',exact:true}).click();await page.getByRole('button',{name:'跳过，进入聊天',exact:true}).click();
 const first=await call('createChat',{agentIds:['claude'],title:'工作会话一'}),second=await call('createChat',{agentIds:['claude'],title:'独立会话二'});assert.notEqual(first.id,second.id);
 let state=await call('bootstrap');assert.equal(state.chats.length,2);assert.equal(state.chats[1].messages.length,0);assert.equal(state.speechStatus.available,true);result.checks.push('真实主进程创建同Agent两个独立会话，Whisper安装状态可用');
 await call('updateProfile',{voice:{enabled:true,language:'auto'},desktop:{notificationsEnabled:false}});
 await page.getByRole('button',{name:'更多设置',exact:true}).click();await page.getByRole('button',{name:'模型与密钥设置',exact:true}).click();await page.getByRole('button',{name:'桌面与语音',exact:true}).click();
 assert.equal(await page.getByRole('switch',{name:'划词助手',exact:true}).count(),0);assert.equal(await page.getByText(/划词|Ctrl \+ Alt \+ G/).count(),0);assert.equal(await page.getByRole('dialog').locator('select').count(),0);
 const language=page.getByRole('combobox',{name:'语音识别语言',exact:true});await language.click();await page.getByRole('option',{name:'英语',exact:true}).click();await expect.poll(async()=>(await call('bootstrap')).profile.voice.language).toBe('en');await expect(language).toHaveText('英语');
 await page.screenshot({path:path.join(dataDir,'桌面与语音设置.png'),animations:'disabled'});await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();result.checks.push('真实设置通过共享下拉框保存语音语言，划词入口已移除');
 const base64=(await fs.readFile('.test-data/speech-fixtures/jfk.wav')).toString('base64');const started=Date.now();const recognized=await call('transcribeAudio',{base64,mime:'audio/wav'});assert.match(recognized.text,/ask not/i);assert.match(recognized.text,/country/i);result.speech={...recognized,elapsedMs:Date.now()-started};assert.equal((await call('bootstrap')).chats.every(c=>c.messages.length===0),true);result.checks.push('真实IPC与本地Whisper转写，未自动发送或调用付费模型');
 await call('updateProfile',{voice:{enabled:false}});await assert.rejects(call('transcribeAudio',{base64,mime:'audio/wav'}),/开启/);result.checks.push('语音开关关闭时主进程拒绝录音转写请求');
 await page.screenshot({path:path.join(dataDir,'聊天窗口.png')});
 const videoState=await call('video:getState');assert.equal(videoState.opened,false);assert.equal(videoState.settings.shortcutEnabled,false);
 await assert.rejects(call('video:open',{platform:'file:///C:/Windows'}),/请选择/);
 await assert.rejects(call('video:action',{name:'executeJavaScript'}),/操作|动作/);
 await assert.rejects(call('video:updateSettings',{opacity:0}),/透明度/);
 await call('video:updateSettings',{opacity:88});assert.equal((await call('video:getState')).settings.opacity,88);
 await page.getByRole('button',{name:'影音',exact:true}).click();await page.getByRole('heading',{name:'影音',exact:true}).waitFor();
 await page.screenshot({path:path.join(dataDir,'影音工作区.png')});
 await page.getByRole('button',{name:'PPT制作',exact:true}).click();await page.getByRole('button',{name:'新建 PPT',exact:true}).waitFor();
 await page.screenshot({path:path.join(dataDir,'PPT工作区.png')});result.checks.push('真实主桥读取影音状态并持久化偏好，拒绝非法平台与动作；PPT和影音主侧栏可进入');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='瓜瓜').close());
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='瓜瓜').isVisible()),false);result.checks.push('主窗口关闭时保留后台与托盘，不销毁聊天会话');
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='瓜瓜');w.show();});
 await call('updateProfile',{desktop:{islandEnabled:false,notificationsEnabled:false}});
 const status=await call('getDesktopStatus');assert.equal(status.islandEnabled,false);assert.equal(status.notificationsEnabled,false);result.checks.push('设置关闭桌面刘海和通知后，桌面状态同步关闭');
 const file=await call('newDocument',{kind:'markdown',name:'退出保护验证',scope:'agents/claude'});
 await page.getByRole('button',{name:'文件',exact:true}).click();await page.getByRole('button',{name:'打开 Claude 文件夹，1 个文件'}).click();await page.getByRole('button',{name:'打开 退出保护验证.md',exact:true}).click();await page.getByLabel('文档内容').fill('# 尚未保存');
 await app.evaluate(({app,dialog})=>{globalThis.quitPrompts=0;dialog.showMessageBoxSync=()=>{globalThis.quitPrompts++;return 0;};app.quit();});
 await page.waitForTimeout(400);assert.equal(await app.evaluate(()=>globalThis.quitPrompts),1);const retained=await call('bootstrap');assert.ok(retained.chats.some(c=>c.id===first.id)&&retained.chats.some(c=>c.id===second.id));await call('updateProfile',{displayName:'退出保护仍可保存'});result.checks.push('未保存文档取消退出后，主进程服务继续工作');
 await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存',{exact:true}).first().waitFor();await page.screenshot({path:path.join(dataDir,'文档编辑.png')});
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.error=error.stack;throw error;}finally{
 if(app){try{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});}catch{}await app.close();}
 await fs.writeFile(path.join(dataDir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
