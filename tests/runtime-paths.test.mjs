import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {configureRuntimePaths} from '../desktop/runtime-paths.mjs';

async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'guagua-paths-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
function fakeApp(executable,isPackaged=true){
  const paths={},switches={};
  return {paths,switches,isPackaged,isReady:()=>false,getPath:name=>{assert.equal(name,'exe');return executable;},setPath:(name,value)=>{paths[name]=value;},commandLine:{appendSwitch:(name,value)=>{switches[name]=value;}}};
}

test('安装版全部应用数据与缓存路径跟随可执行文件，忽略开发覆盖参数',async t=>{
  const installation=await fixture(t),app=fakeApp(path.join(installation,'瓜瓜.exe'));
  const env={STAR_CHAT_TEST_DATA_DIR:path.join(installation,'wrong')};
  const result=configureRuntimePaths(app,{env});
  assert.equal(result.dataDir,path.join(installation,'data'));assert.equal(result.cacheDir,path.join(installation,'cache'));
  for(const directory of Object.values(app.paths)){assert.ok(directory.startsWith(installation+path.sep));assert.ok((await fs.stat(directory)).isDirectory());}
  assert.equal(env.TEMP,path.join(installation,'cache','temp'));assert.equal(env.TMP,env.TEMP);assert.equal(env.TMPDIR,env.TEMP);
  assert.equal(app.switches['disk-cache-dir'],path.join(installation,'cache','http'));
  assert.equal(app.switches['log-file'],path.join(installation,'cache','logs','chromium.log'));
  assert.deepEqual(await fs.readdir(path.join(installation,'cache','temp')),[]);
});

test('开发版使用专用测试目录，目录设置必须早于 ready',async t=>{
  const directory=await fixture(t),app=fakeApp('unused.exe',false),env={STAR_CHAT_TEST_DATA_DIR:directory};
  const result=configureRuntimePaths(app,{env});assert.equal(result.dataDir,directory);assert.equal(result.cacheDir,path.join(directory,'cache'));
  app.isReady=()=>true;assert.throws(()=>configureRuntimePaths(app,{env}),/启动前设置/);
});

test('安装位置不可用时给出中文错误且不配置其他存储位置',async t=>{
  const installation=await fixture(t);await fs.writeFile(path.join(installation,'data'),'occupied');
  const app=fakeApp(path.join(installation,'瓜瓜.exe'));
  assert.throws(()=>configureRuntimePaths(app,{env:{}}),/瓜瓜无法写入数据目录/);
  assert.deepEqual(app.paths,{});assert.deepEqual(app.switches,{});
});
