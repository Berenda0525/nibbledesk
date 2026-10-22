import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeDesktopSettings,overlaySuppression,islandGeometry,islandHitTest,createIslandHover,normalizeAgents,validateQuickInput,normalizeChatSnapshot} from '../desktop/companion-policy.mjs';

test('desktop settings retain island and opt-in notifications, discard legacy selection fields',()=>{
  const value=normalizeDesktopSettings({desktop:{selectionEnabled:true,selectionShortcut:'Control+G',notificationsEnabled:'yes',islandEnabled:false,doNotDisturb:true}});
  assert.deepEqual(value,{islandEnabled:false,closeToIsland:true,doNotDisturb:true,notificationsEnabled:false});
});
test('suppression hides the island for unavailable detector, fullscreen, all busy states and do-not-disturb',()=>{
  const settings=normalizeDesktopSettings();assert.equal(overlaySuppression(settings,null),'detector-unavailable');
  for(const notificationState of [0,1,2,3,4,6,7,undefined])assert.equal(overlaySuppression(settings,{available:true,notificationState}),'system-busy');
  assert.equal(overlaySuppression(settings,{available:true,notificationState:5}),null);
  assert.equal(overlaySuppression(settings,{available:true,notificationState:5,fullscreen:true}),'fullscreen');
  assert.equal(overlaySuppression({...settings,doNotDisturb:true},{available:true,notificationState:5}),'do-not-disturb');
});
test('island uses primary display DIP center, including negative coordinates and scale changes',()=>{
  for(const bounds of [{x:0,y:0,width:1536,height:864},{x:-1280,y:-300,width:1280,height:720},{x:100,y:120,width:320,height:220}]){
    const result=islandGeometry({bounds,scaleFactor:1.5});
    assert.ok(Math.abs(result.x+result.width/2-(bounds.x+bounds.width/2))<=.5);assert.equal(result.y,bounds.y);
    assert.ok(result.width<=bounds.width);assert.ok(result.height<=bounds.height);
  }
  assert.throws(()=>islandGeometry({bounds:{x:0,y:0,width:NaN,height:900}}));
});
test('transparent surrounding space and rounded lower corners do not take input',()=>{
  const geometry=islandGeometry({bounds:{x:0,y:0,width:1600,height:900}});
  assert.equal(islandHitTest({x:800,y:1},geometry,false),true);
  assert.equal(islandHitTest({x:800,y:40},geometry,false),false);
  assert.equal(islandHitTest({x:800,y:40},geometry,true),true);
  assert.equal(islandHitTest({x:geometry.x+18,y:geometry.surfaceHeight},geometry,true),false);
  assert.equal(islandHitTest({x:geometry.x+1,y:20},geometry,true),false);
});
test('hover is reversible and uses one continuous delay without repeated flicker',()=>{
  const state=createIslandHover();assert.equal(state.update(true,0),false);assert.equal(state.update(true,89),false);assert.equal(state.update(true,90),true);
  assert.equal(state.update(false,200),true);assert.equal(state.update(false,619),true);assert.equal(state.update(true,620),true);
  assert.equal(state.update(false,900),true);assert.equal(state.update(false,1319),true);assert.equal(state.update(false,1320),false);
  assert.equal(state.update(true,1600),false);assert.equal(state.update(false,1650),false);assert.equal(state.update(true,1710),false);assert.equal(state.update(true,1799),false);assert.equal(state.update(true,1800),true);
  state.set(false);assert.equal(state.expanded,false);
});
test('active text entry briefly defers mouse-leave collapse while keeping bounded delay',()=>{
  const state=createIslandHover();state.set(true);state.update(false,0);state.hold(500,1000);
  assert.equal(state.update(false,1000),true);assert.equal(state.update(false,1500),false);
});
test('quick chat inputs and snapshots expose only bounded display fields',()=>{
  const agents=normalizeAgents([{id:'claude',name:'Claude',model:'test-model',system:'private'},{id:'claude'},{id:'../evil'}]);assert.equal(agents.length,1);assert.equal(Object.hasOwn(agents[0],'system'),false);
  assert.deepEqual(validateQuickInput({agentId:'claude',text:' hi '},agents),{agentId:'claude',text:'hi'});
  for(const payload of [{agentId:'missing',text:'hello'},{agentId:'claude',text:''},{agentId:'claude',text:'a'.repeat(12001)}])assert.throws(()=>validateQuickInput(payload,agents));
  const snapshot=normalizeChatSnapshot({agentId:'claude',chatId:'chat-123',messages:[{id:'x',role:'system',content:'private'},{id:'y',role:'assistant',content:'<script>alert(1)</script>'}],running:true,secret:'key'},agents);
  assert.equal(snapshot.messages.length,1);assert.equal(snapshot.messages[0].content,'<script>alert(1)</script>');assert.equal(Object.hasOwn(snapshot,'secret'),false);
  assert.match(normalizeChatSnapshot({agentId:'claude',messages:[{role:'assistant',content:'a'.repeat(24001)}]},agents).messages[0].content,/更多内容可在工作台查看/);
});
test('companion no longer registers selection shortcuts or reads a selection',async()=>{
  const main=await fs.readFile(new URL('../desktop/companion.mjs',import.meta.url),'utf8');
  const bridge=await fs.readFile(new URL('../desktop/companion/preload.cjs',import.meta.url),'utf8');
  assert.doesNotMatch(main,/globalShortcut|requestSelection|onSelection|selectionTask|runNative\(['"]selection/);
  assert.doesNotMatch(bridge,/selection-action|requestSelection/);
});
