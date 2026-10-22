import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {DEFAULT_AGENTS,DEFAULT_MODELS} from '../core/catalog.mjs';
import {PRESENTATION_TEMPLATES} from '../core/presentations.mjs';

const root=process.cwd(),output=await fs.mkdtemp(path.join(root,'.test-data','frontend-modules-'));
const result={passed:false,mockBridge:true,paidRequests:0,checks:[],screenshots:[],errors:[]};
const server=await createServer({root,server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1100,height:760},bypassCSP:true});page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>result.errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(({agents,models,templates})=>{
  let listeners=[];const state={agents,models,presentationTemplates:templates,providers:{apimart:{configured:true},volcano:{configured:false}},profile:{displayName:'模块验收',theme:'dark',desktop:{islandEnabled:true,closeToIsland:true,doNotDisturb:false,notificationsEnabled:false},voice:{enabled:true,language:'auto'}},assets:[{id:'ppt-1',name:'门店方案.pptx',type:'document',size:24000,createdAt:'2026-10-21T08:00:00Z',presentation:{agentId:'claude',chatId:'ppt-chat',deck:{title:'门店方案',templateId:'minimal',slides:[{title:'门店定位',bullets:['服务社区用户','提供日常便利']},{title:'开业计划',bullets:['筹备与试营业','收集反馈']}]}}}],chats:[{id:'ppt-chat',title:'方案制作',type:'direct',agentIds:['claude'],messages:[],updatedAt:'2026-10-21T08:00:00Z'}],pendingApprovals:[],version:'ui-test'};
  let video={platform:null,platformName:'',opened:false,visible:false,floating:false,compact:false,suppressed:null,loading:false,error:'',theme:'dark',settings:{topmost:false,opacity:100,shortcutEnabled:false,shortcut:'Alt+Q'},shortcutRegistered:false};
  const emit=event=>listeners.forEach(listener=>listener(structuredClone(event)));const publish=()=>emit({type:'video-state',state:video});
  window.__calls=[];window.__failNext=null;window.__state=()=>structuredClone(state);window.__video=()=>structuredClone(video);window.__publishVideo=patch=>{video={...video,...patch};publish();};
  window.stellar={onEvent:listener=>{listeners.push(listener);return()=>{listeners=listeners.filter(row=>row!==listener);};},call:async(action,payload={})=>{
   window.__calls.push({action,payload});if(window.__failNext?.action===action){const message=window.__failNext.message;window.__failNext=null;throw new Error(message);}
   if(action==='bootstrap')return structuredClone(state);
   if(action==='updateProfile'){state.profile={...state.profile,...payload};emit({type:'state',state});return structuredClone(state);}
   if(action==='video:getState')return structuredClone(video);
   if(action==='video:open'){if(!['douyin','xiaohongshu','bilibili'].includes(payload.platform))throw new Error('错误平台字段');video={...video,platform:payload.platform,platformName:{douyin:'抖音',xiaohongshu:'小红书',bilibili:'B 站'}[payload.platform],opened:true,visible:true,error:''};publish();return structuredClone(video);}
   if(action==='video:updateSettings'){video.settings={...video.settings,...payload};publish();return structuredClone(video);}
   if(action==='video:action'){if(!['float','page','hide','show','reload','close'].includes(payload.name))throw new Error('错误动作字段');if(payload.name==='float')video.floating=true;if(payload.name==='page')video.floating=false;if(payload.name==='hide')video.visible=false;if(payload.name==='show')video.visible=true;if(payload.name==='close'){video.opened=false;video.visible=false;}publish();return structuredClone(video);}
   throw new Error(`模块检查不允许调用 ${action}`);
  }};
 },{agents:DEFAULT_AGENTS,models:DEFAULT_MODELS,templates:PRESENTATION_TEMPLATES});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'domcontentloaded',timeout:60000});
 const nav=title=>page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:title,exact:true});
 const lastCall=action=>page.evaluate(action=>window.__calls.filter(row=>row.action===action).at(-1)?.payload,action);
 await nav('影音').click();await page.getByRole('heading',{name:'尚未打开播放器'}).waitFor();assert.equal(await page.locator('.conversation-sidebar').count(),0);
 for(const [name,id] of [['抖音','douyin'],['小红书','xiaohongshu'],['B站','bilibili']]){await page.getByRole('button',{name:`打开${name}`,exact:true}).click();assert.deepEqual(await lastCall('video:open'),{platform:id});}
 for(const [label,name] of [['视频小窗','float'],['隐藏并暂停','hide'],['显示播放器','show'],['回到网页','page'],['刷新','reload']]){await page.getByRole('button',{name:label,exact:true}).click();assert.deepEqual(await lastCall('video:action'),{name});}
 await page.getByRole('switch',{name:'悬浮置顶'}).check();assert.deepEqual(await lastCall('video:updateSettings'),{topmost:true});await page.getByRole('switch',{name:'影音快捷键'}).check();assert.deepEqual(await lastCall('video:updateSettings'),{shortcutEnabled:true});
 const opacity=page.getByRole('slider',{name:'窗口不透明度'});await opacity.focus();await opacity.press('Home');assert.deepEqual(await lastCall('video:updateSettings'),{opacity:20});await opacity.press('End');assert.deepEqual(await lastCall('video:updateSettings'),{opacity:100});
 result.checks.push('三个平台传platform；小窗/网页/隐藏/显示/刷新传name；置顶/快捷键/不透明度传独立设置字段');
 await page.evaluate(()=>window.__failNext={action:'video:updateSettings',message:'测试：设置保存失败'});await opacity.press('ArrowLeft');await page.getByRole('alert').filter({hasText:'测试：设置保存失败'}).waitFor();await page.waitForFunction(()=>document.querySelector('input[type=range]').value==='100');assert.equal(await page.evaluate(()=>window.__video().settings.opacity),100);result.checks.push('保存设置失败有明确错误，滑块恢复已保存值');
 await page.evaluate(()=>window.__failNext={action:'video:open',message:'测试：平台暂时无法打开'});await page.getByRole('button',{name:'打开抖音',exact:true}).click();await page.getByRole('alert').filter({hasText:'测试：平台暂时无法打开'}).waitFor();assert.equal(await page.evaluate(()=>window.__video().platform),'bilibili');await page.getByRole('button',{name:'打开抖音',exact:true}).click();assert.equal(await page.getByRole('alert').count(),0);
 await page.evaluate(()=>window.__publishVideo({suppressed:'detector-unavailable'}));await page.getByText('桌面状态检测暂不可用，播放器已暂停显示。',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'隐藏并暂停',exact:true}).isDisabled());await page.evaluate(()=>window.__publishVideo({suppressed:null}));
 await nav('PPT制作').click();await page.evaluate(()=>window.__failNext={action:'video:getState',message:'测试：播放器初始化失败'});await nav('影音').click();await page.getByRole('alert').filter({hasText:'测试：播放器初始化失败'}).waitFor();assert.equal(await page.getByText('正在准备播放器…',{exact:true}).count(),0);await page.getByRole('button',{name:'重新载入播放器',exact:true}).click();await page.getByRole('heading',{name:'抖音',exact:true}).waitFor();result.checks.push('平台失败可重试；初始化失败结束加载并提供重试；检测故障状态准确显示');
 const checkLayout=async config=>{const dimensions=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth,workspace:document.querySelector('.workspace').clientWidth,workspaceScroll:document.querySelector('.workspace').scrollWidth}));assert.ok(dimensions.document<=dimensions.viewport&&dimensions.workspaceScroll<=dimensions.workspace+1,JSON.stringify(dimensions));for(const title of ['聊天','联系人','文件','PPT制作','影音','更多设置']){const button=nav(title);assert.ok(await button.isVisible());const box=await button.boundingBox();assert.ok(box.y>=32&&box.y+box.height<=config.height,JSON.stringify({title,box}));}assert.equal(await page.locator('.rail-nav').evaluate(node=>node.scrollHeight>node.clientHeight),false);};
 const screenshot=async name=>{await page.screenshot({path:path.join(output,name),animations:'disabled'});result.screenshots.push(name);};
 for(const theme of ['dark','light']){
  if(theme==='light'){await nav('更多设置').click();await page.getByRole('button',{name:'切换浅色模式',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');}
  for(const config of [{width:1100,height:760},{width:780,height:580}]){
   await page.setViewportSize(config);await nav('影音').click();await page.getByRole('heading',{name:'影音',exact:true}).waitFor();await page.locator('.video-workspace').evaluate(node=>{node.scrollTop=0;});await checkLayout(config);await screenshot(`video-${theme}-${config.width}.png`);
   await nav('PPT制作').click();await page.getByRole('heading',{name:'PPT 制作',exact:true}).waitFor();await checkLayout(config);await screenshot(`ppt-${theme}-${config.width}.png`);
   await page.getByRole('button',{name:'新建 PPT',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.waitFor();let bounds=await dialog.boundingBox();assert.ok(bounds.y>=44&&bounds.y+bounds.height<=config.height-11,JSON.stringify(bounds));await dialog.getByRole('button',{name:'关闭',exact:true}).click();
   await nav('更多设置').click();await page.getByRole('button',{name:'模型与密钥设置',exact:true}).click();await page.getByRole('button',{name:'桌面与语音',exact:true}).click();dialog=page.getByRole('dialog');bounds=await dialog.boundingBox();assert.ok(bounds.y>=44&&bounds.y+bounds.height<=config.height-11,JSON.stringify(bounds));const headerBefore=await dialog.locator('.modal-header').boundingBox();await dialog.locator('.modal-body').evaluate(node=>{node.scrollTop=node.scrollHeight;});const headerAfter=await dialog.locator('.modal-header').boundingBox();assert.equal(headerBefore.y,headerAfter.y);const closeBounds=await dialog.getByRole('button',{name:'关闭',exact:true}).boundingBox();assert.ok(closeBounds.y>=44);
   const language=page.getByRole('combobox',{name:'语音识别语言'});await language.scrollIntoViewIfNeeded();await language.click();const menu=page.getByRole('listbox');await menu.waitFor();const menuBounds=await menu.boundingBox();assert.ok(menuBounds.y>=44&&menuBounds.y+menuBounds.height<=config.height-6);assert.equal(await menu.evaluate(node=>{const r=node.getBoundingClientRect();return !!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[role="listbox"]');}),true);await screenshot(`settings-${theme}-${config.width}.png`);await language.press('Escape');assert.equal(await page.getByRole('listbox').count(),0);assert.ok(await dialog.isVisible());await dialog.getByRole('button',{name:'关闭',exact:true}).click();
   result.checks.push(`${theme} ${config.width}×${config.height}：五入口与底部设置可见，PPT/影音无横溢出，弹层顶部避让/标题固定/下拉可见`);
  }
 }
 await nav('影音').click();await page.getByRole('button',{name:'关闭播放器',exact:true}).click();assert.deepEqual(await lastCall('video:action'),{name:'close'});assert.ok(await page.getByRole('button',{name:'视频小窗',exact:true}).isDisabled());assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.error=error.stack;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}finally{if(browser)await browser.close();await server.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result},null,2));}
