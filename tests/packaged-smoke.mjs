import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const executable=path.join(process.env.GUAGUA_PACKAGED_DIR||path.join(root,'release','win-unpacked'),'瓜瓜.exe');
const screenshots=path.join(root,'输出','测试截图');
await fs.mkdir(screenshots,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.STAR_CHAT_TEST_DATA_DIR;
const errors=[];let application;
try{
  application=await electron.launch({executablePath:executable,env,timeout:45000});
  const page=await application.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.waitForFunction(()=>typeof window.stellar?.call==='function');
  const packaged=await application.evaluate(({app,BrowserWindow})=>{
    const preferences=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {name:app.getName(),version:app.getVersion(),packaged:app.isPackaged,sandbox:preferences.sandbox,contextIsolation:preferences.contextIsolation,nodeIntegration:preferences.nodeIntegration,paths:Object.fromEntries(['userData','sessionData','logs','crashDumps','temp'].map(name=>[name,app.getPath(name)])),httpCache:app.commandLine.getSwitchValue('disk-cache-dir')};
  });
  assert.equal(packaged.packaged,true);assert.equal(packaged.name,'瓜瓜');
  const installationDir=path.dirname(executable);assert.equal(packaged.paths.userData,path.join(installationDir,'data'));
  for(const [name,directory]of Object.entries(packaged.paths))if(name!=='userData')assert.ok(directory.startsWith(path.join(installationDir,'cache')+path.sep));
  assert.equal(packaged.httpCache,path.join(installationDir,'cache','http'));
  assert.equal(packaged.sandbox,true);assert.equal(packaged.contextIsolation,true);assert.equal(packaged.nodeIntegration,false);
  const state=await page.evaluate(()=>window.stellar.call('bootstrap'));
  assert.equal(state.agents.length,6);
  assert.deepEqual(new Set(state.agents.map(agent=>agent.name)),new Set(['Claude','GPT','Gemini','DeepSeek','Kimi','豆包']));
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>星群安装版文档解析测试</w:t></w:r></w:p></w:body></w:document>');
  const docxResult=await application.evaluate(async({app},base64)=>{
    const load=process.getBuiltinModule('module').createRequire(process.getBuiltinModule('path').join(app.getAppPath(),'package.json'));
    const mammoth=load('mammoth');
    const result=await mammoth.extractRawText({buffer:Buffer.from(base64,'base64')});return result.value;
  },await zip.generateAsync({type:'base64'}));
  assert.match(docxResult,/星群安装版文档解析测试/);
  if(!state.providers.apimart.configured){
    await page.getByRole('heading',{name:'连接 APImart',exact:true}).waitFor();
    assert.equal(await page.locator('#setup-key').inputValue(),'');
    await page.screenshot({path:path.join(screenshots,`${stamp}-安装版首次引导.png`),fullPage:true});
  }else{
    await page.screenshot({path:path.join(screenshots,`${stamp}-安装版首页.png`),fullPage:true});
    await page.getByRole('button',{name:'更多设置',exact:true}).click();
    await page.getByRole('button',{name:'模型与密钥设置',exact:true}).click();
    const settings=page.getByRole('dialog');await settings.waitFor();
    assert.equal(await settings.locator('#key-apimart').inputValue(),'');
    assert.equal(await settings.locator('#key-volcano').inputValue(),'');
    await page.screenshot({path:path.join(screenshots,`${stamp}-安装版设置.png`),fullPage:true});
    await settings.getByRole('button',{name:'关闭',exact:true}).click();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,...packaged,agentNames:state.agents.map(agent=>agent.name),packagedDocxParsing:true,rendererErrors:errors,screenshotPrefix:path.join(screenshots,stamp)},null,2));
}finally{if(application)await application.close();}
