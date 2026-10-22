import fs from 'node:fs/promises';
import path from 'node:path';
import {artifactPaths,assertIsolatedAncestors,assertCleanRuntime} from './artifact-paths.mjs';

const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')),p=artifactPaths(pkg.version);
if(process.argv.slice(2).some(x=>x!=='--plan'))throw Error('仅支持 --plan');
if(process.argv.includes('--plan')){console.log(JSON.stringify({from:p.runtime,to:p.qa,evidence:p.evidence},null,2));process.exit(0);}
await assertIsolatedAncestors(p.qa);
try{await fs.access(p.qa);throw Error('本版本验收目录已存在，请先核查数据、进程及清理范围');}catch(e){if(e.code!=='ENOENT')throw e;}
await assertCleanRuntime(p.runtime);
await fs.cp(p.runtime,p.qa,{recursive:true,errorOnExist:true,force:false});
await assertIsolatedAncestors(p.qa);
await fs.mkdir(p.evidence,{recursive:true});
console.log(JSON.stringify({qa:p.qa,evidence:p.evidence,note:'使用独立副本；验收数据须在运行前指定到输出/测试。'}));
