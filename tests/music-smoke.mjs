import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {startMusicServer} from '../desktop/modules/music/server.mjs';
import {startOfficeServer} from '../desktop/office-server.mjs';
const directory=await fs.mkdtemp(path.join(process.cwd(),'.test-data/music-'));
let parent,music,browser;
try{
 parent=await startOfficeServer({appDir:path.resolve('dist'),runtimeDir:path.resolve('resources/office-runtime'),files:{}});
 music=await startMusicServer({root:path.resolve('resources/folia-web-1.5'),dataDir:directory,parentOrigin:parent.origin});
 assert.equal((await fetch(music.origin)).status,403);
 const bootstrap=await fetch(music.url,{redirect:'manual'});assert.equal(bootstrap.status,302);
 const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(music.origin+'/package.json',{headers:{Cookie:cookie}})).status,404);
 assert.equal((await fetch(music.origin,{headers:{Cookie:cookie,Origin:'https://example.com','Sec-Fetch-Site':'cross-site'}})).status,403);
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1200,height:800},locale:'zh-CN'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('console: '+m.text().slice(0,220));});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(parent.appURL);assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
 await page.goto(music.url);await page.waitForTimeout(12000);const frame=page.mainFrame();
 const text=await frame.locator('body').innerText();assert.ok(text.length>50,'Folia 应用应完成渲染');assert.equal(await frame.evaluate(()=>typeof window.stellar),'undefined');
 await fs.writeFile(path.join(directory,'body.txt'),text);await page.screenshot({path:path.join(directory,'music.png')});
 await frame.evaluate(()=>localStorage.setItem('guagua-music-storage-test','retained'));const origin=music.origin;
 await browser.close();browser=null;await music.close();music=await startMusicServer({root:path.resolve('resources/folia-web-1.5'),dataDir:directory,parentOrigin:parent.origin});assert.equal(music.origin,origin);
 console.log(JSON.stringify({passed:errors.length===0,directory,errors,body:text.slice(0,2400),originStable:true,chatBridgeAbsent:true}));assert.deepEqual(errors,[]);
}finally{await browser?.close();await music?.close();await parent?.close();}
