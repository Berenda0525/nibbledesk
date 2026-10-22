import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {DEFAULT_AGENTS,DEFAULT_MODELS} from '../core/catalog.mjs';

const root=process.cwd(),keyboardOnly=process.argv.includes('--keyboard-only'),output=await fs.mkdtemp(path.join(root,'.test-data','frontend-settings-'));
const result={passed:false,mockBridge:true,paidRequests:0,checks:[],screenshots:[],errors:[]};
const server=await createServer({root,server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 for(const config of (keyboardOnly?[{scale:1,width:1100,height:760}]:[{scale:1,width:1100,height:760},{scale:1.25,width:880,height:608},{scale:1.5,width:780,height:580}])){
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.scale,bypassCSP:true});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>result.errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({agents,models})=>{
   let listeners=[];const state={agents,models,assets:[],providers:{apimart:{configured:true},volcano:{configured:true}},profile:{displayName:'界面检查',theme:'dark',desktop:{islandEnabled:true,closeToIsland:true,selectionEnabled:true,doNotDisturb:false,notificationsEnabled:false},voice:{enabled:true,language:'auto'}},chats:[],pendingApprovals:[],version:'ui-test'};
   window.__state=()=>structuredClone(state);window.__calls=[];
   window.stellar={onEvent:listener=>{listeners.push(listener);return()=>{listeners=listeners.filter(item=>item!==listener);};},call:async(action,payload={})=>{window.__calls.push({action,payload});if(action==='bootstrap')return structuredClone(state);if(action==='updateProfile'){state.profile={...state.profile,...payload};listeners.forEach(listener=>listener({type:'state',state:structuredClone(state)}));return structuredClone(state);}throw new Error(`界面检查不允许调用 ${action}`);}};
  },{agents:DEFAULT_AGENTS,models:DEFAULT_MODELS});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:'更多设置',exact:true}).click();await page.getByRole('button',{name:'模型与密钥设置',exact:true}).click();
  const dialog=page.getByRole('dialog'),desktopTab=page.getByRole('button',{name:'桌面与语音',exact:true});await desktopTab.click();
  assert.equal(await page.locator('select').count(),0);assert.equal(await page.getByText(/划词|Ctrl \+ Alt \+ G/).count(),0);
  const bounds=await dialog.evaluate(element=>{const rect=element.getBoundingClientRect(),close=element.querySelector('[aria-label="关闭"]').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,closeTop:close.top,closeBottom:close.bottom};});
  assert.ok(bounds.top>=44,JSON.stringify(bounds));assert.ok(bounds.bottom<=config.height-11,JSON.stringify(bounds));assert.ok(bounds.closeTop>=44);
  const headerBefore=await dialog.locator('.modal-header').boundingBox();await dialog.locator('.modal-body').evaluate(element=>{element.scrollTop=element.scrollHeight;});const headerAfter=await dialog.locator('.modal-header').boundingBox();assert.equal(headerBefore.y,headerAfter.y);
  const language=page.getByRole('combobox',{name:'语音识别语言',exact:true});await language.scrollIntoViewIfNeeded();await language.focus();await language.press('Enter');await page.getByRole('listbox').waitFor();
  const listBounds=await page.getByRole('listbox').boundingBox();assert.ok(listBounds.y>=44);assert.ok(listBounds.y+listBounds.height<=config.height-6);assert.ok(await page.getByRole('option').last().evaluate(element=>{const rect=element.getBoundingClientRect();return !!document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.closest('[role="listbox"]');}));
  await language.press('ArrowDown');await language.press('Enter');await page.waitForFunction(()=>window.__state().profile.voice.language==='zh');assert.equal(await language.textContent(),'中文');
  await language.press('Enter');await language.press('End');await language.press('Enter');await page.waitForFunction(()=>window.__state().profile.voice.language==='en');
  await language.press('Home');await language.press('Enter');await page.waitForFunction(()=>window.__state().profile.voice.language==='auto');
  await language.press('End');await language.press('Enter');await page.waitForFunction(()=>window.__state().profile.voice.language==='en');
  await language.press('Enter');await language.press('Escape');assert.equal(await page.getByRole('listbox').count(),0);assert.ok(await dialog.isVisible());
  await language.press('Enter');await language.press('Tab');assert.equal(await page.getByRole('listbox').count(),0);assert.ok(await dialog.isVisible());
  await language.focus();await language.press('Enter');const focus=await language.evaluate(element=>({outline:getComputedStyle(element).outlineStyle,width:getComputedStyle(element).outlineWidth}));assert.equal(focus.outline,'solid');assert.equal(focus.width,'2px');
  const screenshot=path.join(output,`settings-${config.scale*100}.png`);await page.screenshot({path:screenshot,animations:'disabled'});result.screenshots.push(screenshot);await language.press('Escape');
  result.checks.push(`${config.scale*100}% / ${config.width}×${config.height}：弹层顶部和关闭按钮避开32px窗口控制区，标题固定，语言列表完整，箭头/Enter/Escape/Tab及闭合Home/End首末定位可用`);
  if(config.scale===1&&!keyboardOnly){
   await page.getByRole('button',{name:/模型目录/}).click();const filter=page.getByRole('combobox',{name:'平台筛选',exact:true});await filter.click();await page.getByRole('option',{name:'火山引擎',exact:true}).click();assert.equal(await filter.textContent(),'火山引擎');
   await page.getByText('添加模型或推理接入点',{exact:true}).click();const provider=page.getByRole('combobox',{name:'服务平台',exact:true});await provider.scrollIntoViewIfNeeded();await provider.click();await page.getByRole('option',{name:'火山引擎',exact:true}).click();assert.equal(await provider.textContent(),'火山引擎');
   const kind=page.getByRole('combobox',{name:'模型类型',exact:true});await kind.click();await page.getByRole('option',{name:'图像生成',exact:true}).click();assert.equal(await kind.textContent(),'图像生成');
   await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'联系人',exact:true}).click();await page.getByRole('button',{name:'编辑 豆包',exact:true}).click();
   const model=page.getByRole('combobox',{name:'模型版本',exact:true});await model.click();await page.getByRole('listbox').waitFor();const visibleOption=page.getByRole('option').first();await visibleOption.click();assert.ok(await dialog.isVisible());
   const avatar=await dialog.locator('.avatar-doubao').evaluate(element=>({radius:getComputedStyle(element).borderRadius,overflow:getComputedStyle(element).overflow,source:element.querySelector('img').src}));assert.equal(avatar.radius,'50%');assert.equal(avatar.overflow,'hidden');assert.ok(avatar.source.endsWith('/assets/agents/doubao-user.png'));
   result.checks.push('平台筛选、自定义服务平台、模型类型和Agent模型版本均使用自定义列表；圆形豆包头像保持');
   await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'更多设置',exact:true}).click();await page.getByRole('button',{name:'切换浅色模式',exact:true}).click();await page.getByRole('button',{name:'更多设置',exact:true}).click();await page.getByRole('button',{name:'模型与密钥设置',exact:true}).click();await page.getByRole('button',{name:'桌面与语音',exact:true}).click();
   await page.getByRole('combobox',{name:'语音识别语言'}).click();const lightScreenshot=path.join(output,'settings-light.png');await page.screenshot({path:lightScreenshot,animations:'disabled'});result.screenshots.push(lightScreenshot);
  }
  await context.close();
 }
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.error=error.stack;throw error;}finally{if(browser)await browser.close();await server.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result},null,2));}
