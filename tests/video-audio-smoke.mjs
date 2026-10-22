import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const {_electron}=require('playwright');
const data=path.join(root,'.test-data','video-audio-'+Date.now());await fs.mkdir(data,{recursive:true});
const app=await _electron.launch({executablePath:require('electron'),args:[path.join(root,'tests','video-harness.mjs')],env:{...process.env,GUAGUA_VIDEO_TEST_DATA:data}});
const checks=[];
try{
  const host=await app.firstWindow();await host.waitForSelector('#platform');
  let page;for(let i=0;i<40;i++){page=(await app.windows()).find(p=>p.url().startsWith('https://www.douyin.com/'));if(page)break;await new Promise(r=>setTimeout(r,50));}assert.ok(page);await page.waitForSelector('#start');
  await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='nested';frame.srcdoc='<button id="play">播放嵌套视频</button><video id="v" muted></video><script>const c=document.createElement("canvas");c.width=100;c.height=100;const ctx=c.getContext("2d");setInterval(()=>ctx.fillRect(0,0,100,100),50);v.srcObject=c.captureStream(20);play.onclick=()=>v.play();<\/script>';document.body.prepend(frame);});
  const nested=page.frameLocator('#nested');await nested.locator('#play').click();await nested.locator('video').evaluate(v=>new Promise(resolve=>{if(!v.paused)resolve();else v.addEventListener('play',resolve,{once:true});}));
  const mute=(value)=>app.evaluate(({webContents},value)=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://www.douyin.com/'));if(value!==null)wc.setAudioMuted(value);return wc.isAudioMuted();},value);
  const act=name=>app.evaluate((_e,name)=>globalThis.videoTest.module.action(name),name);
  const waitState=async predicate=>{for(let i=0;i<160;i++){const state=await app.evaluate(()=>globalThis.videoTest.module.getState());if(predicate(state))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('影音状态未在限定时间内达到预期');};
  assert.equal(await mute(null),false);await act('hide');assert.equal(await mute(null),true);assert.equal(await nested.locator('video').evaluate(v=>v.paused),false);await act('show');assert.equal(await mute(null),false);checks.push('嵌套帧仍运行时整页隐藏静音并正确恢复');
  await mute(true);await act('hide');await act('hide');await act('show');assert.equal(await mute(null),true);checks.push('用户先前静音和重复隐藏均保持');
  await mute(false);await app.evaluate(()=>globalThis.videoTest.module.open('xiaohongshu'));assert.equal(await mute(null),true);await app.evaluate(()=>globalThis.videoTest.module.open('douyin'));assert.equal(await mute(null),false);checks.push('切换平台静音后台页，返回恢复原状态');
  await app.evaluate(()=>{globalThis.videoTest.suppressed='fullscreen';});await waitState(s=>s.suppressed==='fullscreen'&&!s.visible);assert.equal(await mute(null),true);await app.evaluate(()=>{globalThis.videoTest.suppressed=null;});await waitState(s=>s.suppressed===null&&s.visible);assert.equal(await mute(null),false);checks.push('全屏抑制静音与恢复');
  await app.evaluate(()=>globalThis.videoTest.module.dispose());
  const report={passed:true,checks,data,scope:'All HTTPS intercepted; nested canvas video stays running but WebContents audio is muted; no live websites or account use'};await fs.writeFile(path.join(data,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.log(JSON.stringify(await app.evaluate(()=>globalThis.videoTest.muteEvents),null,2));throw error;}finally{await app.close();}
