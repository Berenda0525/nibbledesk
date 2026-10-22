import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const project=fileURLToPath(new URL('../',import.meta.url));
export function artifactPaths(version){
  if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw Error('版本号不合法');
  const release=path.join(project,'release'),external=path.join(path.parse(project).root,'GuaguaBuild');
  return {project,release,external,versionRelease:path.join(release,version),runtime:path.join(release,version,'win-unpacked'),
    qa:path.join(external,'qa',version),evidence:path.join(project,'输出','测试'),source:path.join(project,'.build-cache','release-source-current')};
}
export async function assertIsolatedAncestors(directory){
  let existing=path.resolve(directory),canonical;const suffix=[];
  while(true){
    try{canonical=path.join(await fs.realpath(existing),...suffix.reverse());break;}
    catch(e){if(e.code!=='ENOENT')throw e;suffix.push(path.basename(existing));const parent=path.dirname(existing);if(parent===existing)throw e;existing=parent;}
  }
  const canonicalProject=await fs.realpath(project);
  const targets=[path.resolve(directory),canonical];
  for(const target of targets){
    const relative=path.relative(canonicalProject,target);
    if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('验收目录必须位于项目外');
  }
  for(const target of targets){
    for(let parent=path.dirname(target);;parent=path.dirname(parent)){
      try{await fs.lstat(path.join(parent,'node_modules'));throw Error('验收目录上级存在 node_modules：'+parent);}catch(e){if(e.code!=='ENOENT')throw e;}
      if(path.dirname(parent)===parent)break;
    }
  }
}
export async function assertCleanRuntime(directory){
  const root=await fs.lstat(directory);if(root.isSymbolicLink())throw Error('发行目录不能为链接');
  async function visit(dir,relative=''){
    for(const item of await fs.readdir(dir,{withFileTypes:true})){
      const rel=path.join(relative,item.name);
      if(item.isSymbolicLink())throw Error('发行目录包含链接：'+rel);
      if(!relative&&['data','cache'].includes(item.name.toLowerCase()))throw Error('发行目录包含用户数据：'+rel);
      if(item.isDirectory())await visit(path.join(dir,item.name),rel);
    }
  }
  await visit(directory);
}
