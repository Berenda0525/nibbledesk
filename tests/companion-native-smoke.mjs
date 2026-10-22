import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=await fs.mkdtemp(path.join(root,'.test-data','companion-native-'));
const env={...process.env,STAR_CHAT_TEST_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let application;const checks=[];
try{
  application=await electron.launch({args:[path.join(root,'tests/companion-harness-main.mjs')],env,timeout:30000});
  const page=await application.firstWindow();await page.waitForTimeout(700);
  await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.fromId(globalThis.companionTest.mainId);w.show();w.setFullScreen(true);w.focus();});await page.waitForTimeout(700);
  const probe=await application.evaluate(async({BrowserWindow})=>{const t=globalThis.companionTest;BrowserWindow.fromId(t.mainId).focus();return t.nativeProbe();});
  console.log(JSON.stringify({probe,window:await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.fromId(globalThis.companionTest.mainId);return {focused:w.isFocused(),fullscreen:w.isFullScreen(),bounds:w.getBounds()};})}));
  assert.equal(probe.available,true);assert.equal(probe.fullscreen,true);checks.push('原生检测识别自有全屏窗口');
  await application.evaluate(async(_,{probe})=>{const t=globalThis.companionTest;t.state.probe=probe;await t.companion.updateSettings();},{probe});await page.waitForTimeout(350);
  assert.equal(await application.evaluate(()=>globalThis.companionTest.companion.getStatus().islandVisible),false);checks.push('真实全屏结果抑制刘海');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.fromId(globalThis.companionTest.mainId).setFullScreen(false));
  assert.equal(await application.evaluate(()=>globalThis.companionTest.state.nativeCalls.includes('selection')),false);checks.push('运行路径不读取选区');
  console.log(JSON.stringify({passed:true,checks,probe},null,2));
}finally{await application?.close();}
