import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import asar from '@electron/asar';

const root=process.cwd(),packed=path.resolve(process.argv[2]??''),output=path.resolve(process.argv[3]??'输出/测试/release-integrity.json');
if(!process.argv[2])throw Error('请指定独立打包目录');
const archive=path.join(packed,'resources/app.asar'),hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const packagedFile=file=>asar.extractFile(archive,path.normalize(file));
const sourceFiles=['core/island-chat.mjs','core/profile.mjs','core/service.mjs','core/providers.mjs','desktop/main.mjs','desktop/preload.cjs','desktop/companion.mjs','desktop/companion-policy.mjs','desktop/companion/overlay.js','desktop/companion/overlay.css','desktop/companion/index.html','desktop/companion/preload.cjs','desktop/harness-runtime.mjs','desktop/speech.mjs','dist/index.html','dist/assets/agents/doubao-user.png'];
sourceFiles.push(...(await fs.readdir('desktop/modules/video')).map(file=>'desktop/modules/video/'+file));
sourceFiles.push('core/conversation-navigation.mjs','core/harness-proxy.mjs','core/usage-stream.mjs','core/pricing.mjs','desktop/window-layout.mjs','desktop/modules/harness/module.mjs','desktop/modules/music/netease.mjs','desktop/modules/music/netease-worker.cjs','desktop/modules/music/preload.cjs','desktop/companion/file-drop.js','desktop/companion/integrations.css');
sourceFiles.push('core/presentation-template.mjs','core/presentations.mjs','desktop/harness-tools-plugin.mjs','core/task-execution.mjs');
sourceFiles.push('core/atomic-file.mjs','desktop/file-store.mjs','desktop/key-store.mjs');
sourceFiles.push('core/provider-config.mjs','core/usage.mjs','shared/audio-wav.mjs','desktop/modules/music/module.mjs','desktop/modules/music/server.mjs','desktop/documents.mjs','desktop/office/office.js','desktop/office/office-thread.js');
const assets=await fs.readdir(path.join(root,'dist/assets'));sourceFiles.push(...assets.filter(file=>/^index-.*\.(js|css)$/.test(file)).map(file=>'dist/assets/'+file));
const sources=[];for(const file of sourceFiles){const expected=hash(await fs.readFile(path.join(root,file))),actual=hash(packagedFile(file));assert.equal(actual,expected,file);sources.push({file,sha256:actual});}
const top=await fs.readdir(packed);assert.equal(top.includes('data'),false,'打包目录不能含用户data');assert.equal(top.includes('cache'),false,'打包目录不能含运行cache');
const roots=[...new Set(asar.listPackage(archive).map(name=>name.replace(/^[/\\]/,'').split(/[/\\]/)[0]))];assert.ok(roots.every(name=>['core','desktop','dist','shared','node_modules','package.json','LICENSE','NOTICE.txt'].includes(name)),roots.join(','));
const sourcePackage=JSON.parse(await fs.readFile('package.json','utf8')),packagedPackage=JSON.parse(packagedFile('package.json').toString());assert.equal(packagedPackage.version,sourcePackage.version);
const musicSource=sourcePackage.build.extraResources.find(v=>v.to==='folia-web').from;let musicResourceCount=0;
async function checkMusic(relative=''){
 for(const entry of await fs.readdir(path.join(root,musicSource,relative),{withFileTypes:true})){
  const name=path.join(relative,entry.name);if(entry.isDirectory())await checkMusic(name);else{assert.equal(hash(await fs.readFile(path.join(packed,'resources/folia-web',name))),hash(await fs.readFile(path.join(root,musicSource,name))),name);musicResourceCount++;}
 }
}
await checkMusic();
for(const file of await fs.readdir('resources/folia-source'))assert.equal(hash(await fs.readFile(path.join(packed,'resources/folia-source',file))),hash(await fs.readFile(path.join(root,'resources/folia-source',file))),file);
const dependencies=[];for(const [name,version] of Object.entries(sourcePackage.dependencies).filter(([name])=>name.startsWith('@deepseek-ai/')||name==='mime-db'||name==='@xmldom/xmldom')){const actual=JSON.parse(packagedFile(`node_modules/${name}/package.json`).toString()).version;assert.equal(actual,version,name);dependencies.push({name,version:actual});}
const speechDirectory=path.join(packed,'resources/speech'),binaries=await fs.readdir(path.join(speechDirectory,'runtime/Release'));assert.equal(binaries.length,18);
for(const file of binaries)assert.equal(hash(await fs.readFile(path.join(speechDirectory,'runtime/Release',file))),hash(await fs.readFile(path.join(root,'resources/speech/runtime/Release',file))),file);
const speechFiles=await fs.readdir(speechDirectory),licenses=speechFiles.filter(file=>file.startsWith('LICENSE-'));
const provenance=JSON.parse(await fs.readFile(path.join(speechDirectory,'provenance.json'),'utf8'));
for(const license of provenance.licenses){assert.ok(licenses.includes(license.file));assert.equal(hash(await fs.readFile(path.join(speechDirectory,license.file))),license.sha256,license.file);}
const doubao=hash(packagedFile('desktop/companion/assets/doubao.png'));assert.equal(doubao,hash(await fs.readFile('public/assets/agents/doubao-user.png')));
assert.equal(JSON.parse(packagedFile('node_modules/image-size/package.json')).version,'2.0.4');
const packedEntries=asar.listPackage(archive).map(name=>name.replaceAll('\\','/'));
for(const excluded of ['/node_modules/mammoth/bin/','/node_modules/mammoth/node_modules/argparse/','/node_modules/sprintf-js/','/node_modules/argparse/'])assert.equal(packedEntries.some(name=>name.startsWith(excluded)),false,excluded);
const snapshotDir=path.join(packed,'resources/source');
const manifest=JSON.parse(await fs.readFile(path.join(snapshotDir,'source-manifest.json'),'utf8'));
assert.equal(manifest.version,sourcePackage.version);
const expected=new Set(['source-manifest.json',...manifest.files.map(item=>item.file)]);
async function checkSnapshot(relative=''){
 for(const entry of await fs.readdir(path.join(snapshotDir,relative),{withFileTypes:true})){
  const file=path.posix.join(relative,entry.name);assert.equal(entry.isSymbolicLink(),false,file);
  if(entry.isDirectory())await checkSnapshot(file);else assert.ok(expected.has(file),`清单外源码：${file}`);
 }
}
await checkSnapshot();
for(const entry of manifest.files){
 assert.equal(hash(await fs.readFile(path.join(snapshotDir,entry.file))),entry.sha256,entry.file);
 assert.equal(hash(await fs.readFile(path.join(root,entry.file))),entry.sha256,`当前源码：${entry.file}`);
}
const report={passed:true,packed,version:packagedPackage.version,sources,dependencies,sourceSnapshotCount:manifest.files.length,speechBinaryCount:binaries.length,speechLicenseCount:licenses.length,archiveRoots:roots,musicResourceCount,createdAt:new Date().toISOString()};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,sourceCount:sources.length,dependencyCount:dependencies.length,speechBinaryCount:binaries.length,output}));
