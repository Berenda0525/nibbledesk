import fs from 'node:fs/promises';
import path from 'node:path';
import {artifactPaths} from './artifact-paths.mjs';

const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')),p=artifactPaths(pkg.version);
const drive=path.parse(p.project).root,roots=[p.release,p.external,path.join(p.project,'.test-data'),path.join(p.project,'.build-cache')];
for(const entry of await fs.readdir(drive,{withFileTypes:true}))if(/^Guagua-/i.test(entry.name))roots.push(path.join(drive,entry.name));
const reports=[];
for(const root of roots){
 const report={root,logicalBytes:0,files:0,hardlinkedFiles:0,hardlinkedLogicalBytes:0,links:[],errors:[]};
 async function visit(file){
  try{
   const stat=await fs.lstat(file);
   if(stat.isSymbolicLink()){report.links.push({path:file,target:await fs.readlink(file)});return;}
   if(stat.isDirectory()){for(const name of await fs.readdir(file))await visit(path.join(file,name));}
   else if(stat.isFile()){report.files++;report.logicalBytes+=stat.size;if(stat.nlink>1){report.hardlinkedFiles++;report.hardlinkedLogicalBytes+=stat.size;}}
  }catch(e){if(file===root&&e.code==='ENOENT')report.missing=true;else report.errors.push({path:file,code:e.code});}
 }
 await visit(root);reports.push(report);
}
await fs.mkdir(p.evidence,{recursive:true});
const output=path.join(p.evidence,'产物盘点.json');
await fs.writeFile(output,JSON.stringify({createdAt:new Date().toISOString(),note:'逻辑文件大小，不等于可回收空间；硬链接和目录链接需逐项核查。此命令只盘点，不清理。',reports},null,2));
console.log(JSON.stringify({output,reports:reports.map(x=>({root:x.root,logicalGB:+(x.logicalBytes/1024**3).toFixed(2),files:x.files,hardlinkedFiles:x.hardlinkedFiles,links:x.links.length,errors:x.errors.length}))},null,2));
