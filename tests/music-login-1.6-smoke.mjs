import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dataDir=await fs.mkdtemp(path.resolve('.test-data/music-login-1.6-')),env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;let app;
try{
 app=await electron.launch({args:[process.cwd()],env,timeout:60000});const page=await app.firstWindow();
 await page.getByLabel('APImart API Key').fill('music-local-fixture');await page.getByRole('button',{name:'继续',exact:true}).click();await page.getByRole('button',{name:'跳过，进入聊天',exact:true}).click();
 await page.getByRole('button',{name:'音乐',exact:true}).click();await page.evaluate(()=>window.stellar.call('music:getState'));
 const music=app.windows().find(p=>p!==page&&p.url().startsWith('http://127.0.0.1:')&&!p.url().includes('/app/'));assert.ok(music);await music.getByText('本地',{exact:true}).first().waitFor();
 const qr=await music.evaluate(async()=>{const start=performance.now();const get=async path=>{const r=await fetch('/netease-api'+path);const b=await r.json();if(!r.ok)throw Error(b.message||String(r.status));return b;};const key=(await get('/login/qr/key?timestamp='+Date.now())).data.unikey;const picture=(await get('/login/qr/create?key='+encodeURIComponent(key)+'&qrimg=true')).data;const status=await get('/login/qr/check?key='+encodeURIComponent(key));return {keyPresent:!!key,png:picture.qrimg.slice(0,30),code:status.code,ms:performance.now()-start};});
 assert.ok(qr.keyPresent);assert.match(qr.png,/^data:image\/png;base64,/);assert.equal(qr.code,801);await fs.writeFile(path.join(dataDir,'qr-result.json'),JSON.stringify({passed:true,qr,actualLogin:false},null,2));console.log(JSON.stringify({passed:true,qr,actualLogin:false,dataDir}));
}finally{await app?.close();}
