import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),dataDir=await fs.mkdtemp(path.join(root,'.test-data/island-voice-')),env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let app;try{
 app=await electron.launch({args:[path.join(root,'tests/companion-harness-main.mjs'),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],env,timeout:30000});
 await app.firstWindow();await app.evaluate(async({screen})=>{while(!globalThis.companionTest?.companion.getStatus().nativeAvailable)await new Promise(r=>setTimeout(r,30));const b=screen.getPrimaryDisplay().bounds;globalThis.companionTest.state.cursor={x:b.x+b.width/2,y:b.y+10};});
 const page=app.windows().find(p=>p.url().includes('mode=island'));await page.waitForFunction(()=>document.getElementById('island').dataset.expanded==='true');
 await page.getByRole('button',{name:'切换快聊模型'}).click();await page.getByRole('option',{name:'另一个测试版本'}).click();await page.waitForFunction(()=>document.getElementById('model-label').textContent.includes('model-next'));
 await page.getByRole('textbox',{name:'快聊输入'}).fill('保留手写草稿');await page.getByRole('button',{name:'语音输入',exact:true}).click();await page.waitForFunction(()=>document.getElementById('voice').classList.contains('recording'),{},{timeout:10000});await page.waitForTimeout(700);
 await page.getByRole('button',{name:'语音输入',exact:true}).click();await page.waitForFunction(()=>document.getElementById('prompt').value.includes('语音草稿测试'),{},{timeout:15000});
 const result=await app.evaluate(()=>({voice:globalThis.companionTest.state.voice,submitted:globalThis.companionTest.state.submitted}));const wav=Buffer.from(result.voice.base64,'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readUInt16LE(22),1);assert.equal(result.submitted.length,0);assert.match(await page.getByRole('textbox',{name:'快聊输入'}).inputValue(),/保留手写草稿/);
 assert.equal(await page.locator('.compact-logo').evaluate(i=>i.complete&&i.naturalWidth>0),true);await page.screenshot({path:path.join(dataDir,'island.png')});console.log(JSON.stringify({passed:true,dataDir,bytes:wav.length,realRecorder:true,transcriber:'fixture callback',modelSwitch:true,noAutoSend:true}));
}finally{await app?.close();}
