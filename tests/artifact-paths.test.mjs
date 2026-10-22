import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {project,artifactPaths,assertIsolatedAncestors,assertCleanRuntime} from '../scripts/artifact-paths.mjs';

test('产物位置固定，版本不能逃逸目录',()=>{
  const p=artifactPaths('1.7.1');
  assert.equal(path.relative(p.project,p.release),'release');
  assert.equal(path.relative(p.release,p.versionRelease),'1.7.1');
  assert.equal(path.relative(p.project,p.evidence),path.join('输出','测试'));
  assert.equal(path.basename(p.external),'GuaguaBuild');
  assert.throws(()=>artifactPaths('../escape'));
});
test('打包计划与配置使用相同源码快照，拒绝外部输出覆盖',async()=>{
  const pkg=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
  const run=spawnSync(process.execPath,[path.join(project,'scripts/package-desktop.mjs'),'--plan'],{encoding:'utf8',windowsHide:true});
  assert.equal(run.status,0,run.stderr);
  const plan=JSON.parse(run.stdout);
  const snapshot=pkg.build.extraResources.find(x=>x.to==='source');
  assert.equal(path.resolve(project,snapshot.from),plan.source);
  const rejected=spawnSync(process.execPath,[path.join(project,'scripts/package-desktop.mjs'),'--plan','-c.directories.output=E:/escape'],{encoding:'utf8',windowsHide:true});
  assert.notEqual(rejected.status,0);
});
test('隔离检查拒绝上级依赖和带运行数据的发行目录',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'guagua-path-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const qa=path.join(root,'qa','app');await fs.mkdir(qa,{recursive:true});
  await assertIsolatedAncestors(qa);
  await fs.mkdir(path.join(root,'node_modules'));
  await assert.rejects(assertIsolatedAncestors(qa),/node_modules/);
  await fs.mkdir(path.join(qa,'data'));
  await assert.rejects(assertCleanRuntime(qa),/data/);
  const alias=path.join(root,'alias');await fs.symlink(project,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(assertIsolatedAncestors(path.join(alias,'not-created','qa')),/项目外/);
});
