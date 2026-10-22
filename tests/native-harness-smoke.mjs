import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dataDir=await fs.mkdtemp(path.join(root,'.test-data/native-harness-')),env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;let app;
try{app=await electron.launch({args:[root],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.getByLabel('APImart API Key').fill('native-harness-fixture-only');await page.getByRole('button',{name:'继续',exact:true}).click();await page.getByRole('button',{name:'跳过，进入聊天',exact:true}).click();
 const state=await page.evaluate(()=>window.stellar.call('harness:getState'));assert.equal(state.ready,true);
 await page.evaluate(()=>window.stellar.call('harness:mount',{bounds:{x:70,y:80,width:850,height:520}}));
 let native;for(let i=0;i<100;i++){native=app.windows().find(p=>p!==page&&p.url().startsWith('http://127.0.0.1:')&&!p.url().includes('/app/')&&!p.url().includes('/office/'));if(native)break;await page.waitForTimeout(200);}assert.ok(native,'原生 Harness 网页必须存在');await native.locator('body').waitFor();await native.waitForFunction(()=>document.body.innerText.trim().length>100,{},{timeout:60000});
 const text=await native.locator('body').innerText();assert.match(text,/DeepSeek|Harness|新会话|会话|New|Session/i);assert.equal(await native.evaluate(()=>typeof window.stellar),'undefined');await native.screenshot({path:path.join(dataDir,'native-harness.png')});
 const patch=JSON.parse(await fs.readFile(path.join(dataDir,'modules/harness/home/guagua-models.patch.json'),'utf8'));assert.ok(JSON.stringify(patch).includes('guagua-apimart'));assert.equal(JSON.stringify(patch).includes('native-harness-fixture-only'),false);console.log(JSON.stringify({passed:true,dataDir,profile:state.profile,bodyPreview:text.slice(0,600),platformKeyInPatch:false,paidModelRequests:0}));
}finally{await app?.close();}
