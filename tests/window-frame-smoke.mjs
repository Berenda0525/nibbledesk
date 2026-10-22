import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(root,'.test-data'),{recursive:true});
const dataDir=await fs.mkdtemp(path.join(root,'.test-data','window-frame-'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join(root,'输出','测试截图',stamp+'-窗口边框');await fs.mkdir(output,{recursive:true});
const env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let application;const checks=[],errors=[],checksOnly=process.argv.includes('--checks-only');
try{
  application=await electron.launch({args:[root],env,timeout:45000});
  const page=await application.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('heading',{name:'连接 APImart',exact:true}).waitFor();
  await page.locator('#setup-key').fill('window-frame-smoke-fake-key-no-network');
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'跳过，进入聊天',exact:true}).click();
  await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];globalThis.frameMainId=w.id;w.setBounds({x:170,y:65,width:1000,height:640});w.focus();});
  async function capture(label,{nativeCapture=true,blur=false}={}){
    await page.waitForTimeout(750);
    const css=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,roots:['html','body','#root'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor),frame:{border:getComputedStyle(document.querySelector('.desktop-frame')).borderTopWidth,radius:getComputedStyle(document.querySelector('.desktop-frame')).borderTopLeftRadius}}));
    assert.equal(css.frame.border,'0px');assert.equal(css.frame.radius,'0px');assert.ok(css.roots.every(value=>value===(css.theme==='dark'?'rgb(39, 39, 39)':'rgb(233, 233, 233)')));console.log('ROOT STYLES',label,css);
    if(!nativeCapture){const state=await application.evaluate(({BrowserWindow,nativeTheme})=>{const w=BrowserWindow.fromId(globalThis.frameMainId);return {focused:w.isFocused(),maximized:w.isMaximized(),bounds:w.getBounds(),theme:nativeTheme.themeSource,background:w.getBackgroundColor(),accent:w.getAccentColor()};});checks.push({label,css,native:state});if(label.endsWith('聚焦'))await page.screenshot({path:path.join(output,label+'-网页.png')});return;}
    await page.screenshot({path:path.join(output,label+'-网页.png')});
    await application.evaluate(async({BrowserWindow},blur)=>{if(blur){const helper=BrowserWindow.fromId(globalThis.frameFocusId);helper.show();helper.focus();}else BrowserWindow.fromId(globalThis.frameMainId).focus();},blur);
    await new Promise(resolve=>setTimeout(resolve,300));
    const native=await application.evaluate(async({BrowserWindow,desktopCapturer,nativeTheme})=>{
      const w=BrowserWindow.fromId(globalThis.frameMainId),id=w.getMediaSourceId();
      const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:2560,height:1800},fetchWindowIcons:false});
      const source=sources.find(item=>item.id===id);if(!source)throw new Error('未找到自有窗口捕获源');
      const size=source.thumbnail.getSize(),bitmap=source.thumbnail.toBitmap();
      const pixel=(x,y)=>{const i=(y*size.width+x)*4;return [...bitmap.subarray(i,i+4)];};
      return {png:source.thumbnail.toPNG().toString('base64'),sourceId:id,size,focused:w.isFocused(),maximized:w.isMaximized(),bounds:w.getBounds(),contentBounds:w.getContentBounds(),theme:nativeTheme.themeSource,background:w.getBackgroundColor(),accent:w.getAccentColor(),pixels:{top:pixel(Math.floor(size.width/2),0),left:pixel(0,Math.floor(size.height/2)),topInner:pixel(Math.floor(size.width/2),2),leftInner:pixel(2,Math.floor(size.height/2)),corner:pixel(0,0)}};
    });
    await fs.writeFile(path.join(output,label+'-完整窗口.png'),Buffer.from(native.png,'base64'));delete native.png;
    checks.push({label,css,native});
  }
  for(const theme of ['dark','light']){
    if(theme==='light'){await page.evaluate(()=>window.stellar.call('updateProfile',{theme:'light'}));await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');}
    await application.evaluate(({BrowserWindow})=>BrowserWindow.fromId(globalThis.frameMainId).focus());
    await capture(theme+'-聚焦',{nativeCapture:theme==='dark'&&!checksOnly});
    if(theme==='dark'&&!checksOnly){
      await application.evaluate(async({BrowserWindow})=>{const helper=new BrowserWindow({x:0,y:0,width:150,height:80,show:false,frame:false,title:'边框焦点测试',skipTaskbar:true,backgroundColor:'#161616',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});globalThis.frameFocusId=helper.id;await helper.loadURL('data:text/html,<title>Focus probe</title>');helper.show();helper.focus();});
      await capture(theme+'-失焦',{blur:true});assert.equal(checks.at(-1).native.focused,false);
      await application.evaluate(({BrowserWindow})=>BrowserWindow.fromId(globalThis.frameFocusId)?.destroy());
    }
    await application.evaluate(({BrowserWindow})=>{BrowserWindow.fromId(globalThis.frameMainId).focus();BrowserWindow.fromId(globalThis.frameMainId).maximize();});
    await capture(theme+'-最大化',{nativeCapture:false});assert.equal(checks.at(-1).native.maximized,true);
    await application.evaluate(({BrowserWindow})=>BrowserWindow.fromId(globalThis.frameMainId).unmaximize());
    await capture(theme+'-还原',{nativeCapture:false});assert.equal(checks.at(-1).native.maximized,false);
  }
  await page.evaluate(()=>window.stellar.call('removeProvider',{provider:'apimart'}));
  assert.deepEqual(errors,[]);
  const report={passed:true,dataDir,output,checks,errors};await fs.writeFile(path.join(output,'报告.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{if(application)await application.close();}
