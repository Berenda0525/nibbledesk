import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const {_electron}=require('playwright');
const stamp=Date.now(),data=path.join(root,'.test-data','video-public-'+stamp),output=path.join(root,'输出','测试截图','影音公开首页-'+stamp);
await fs.mkdir(data,{recursive:true});await fs.mkdir(output,{recursive:true});
const app=await _electron.launch({executablePath:require('electron'),args:[path.join(path.dirname(fileURLToPath(import.meta.url)),'video-public-harness.mjs')],env:{...process.env,GUAGUA_VIDEO_PUBLIC_DATA:data}});
const results=[];
try{
  await app.firstWindow();
  for(const id of ['douyin','xiaohongshu','bilibili']){
    if(id!=='douyin')await app.evaluate((_e,id)=>globalThis.videoPublic.module.open(id),id);
    let summary=null;const began=Date.now();
    while(Date.now()-began<25000){
      await new Promise(resolve=>setTimeout(resolve,1000));
      summary=await app.evaluate(async({webContents},id)=>{
        const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https:')&&w.session.getStoragePath()?.endsWith(id));
        if(!wc)return null;
        try{return await wc.executeJavaScript(`(()=>{const text=document.body?.innerText||'';return {title:document.title,location:location.origin+location.pathname,readyState:document.readyState,textLength:text.length,loginPrompt:/登录|登錄|扫码|二维码/.test(text),verificationPrompt:/验证码|安全验证|完成验证|验证后|拖动滑块|verify you are human/i.test(text),videoElements:document.querySelectorAll('video').length,bridgeAvailable:typeof window.guaguaVideo!=='undefined'}})()`);}catch{return null;}
      },id);
      if(Date.now()-began>=6000&&summary?.textLength>20&&summary.readyState!=='loading')break;
    }
    const state=await app.evaluate(()=>globalThis.videoPublic.module.getState());
    const record={platform:id,elapsedMs:Date.now()-began,...summary,state};results.push(record);
    await app.evaluate((_e,file)=>globalThis.videoPublic.capture(file),path.join(output,id+'-播放器.png'));
    await app.evaluate((_e,{id,file})=>globalThis.videoPublic.captureRemote(id,file),{id,file:path.join(output,id+'-网页.png')}).catch(error=>{record.screenshotError=error.message.split('\n')[0];});
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify({completed:false,results,data,scope:'Fresh isolated sessions; public homepages only; no login, credentials, messages or challenge bypass'},null,2));
    console.log(JSON.stringify(record));
  }
  await app.evaluate(()=>globalThis.videoPublic.module.dispose());
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({completed:true,results,data,scope:'Fresh isolated sessions; public homepages only; no login, credentials, messages or challenge bypass',ownedWindowsClosed:true},null,2));
  console.log(JSON.stringify({completed:true,output}));
}finally{await app.close();}
