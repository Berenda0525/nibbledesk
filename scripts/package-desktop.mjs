import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {artifactPaths,assertCleanRuntime} from './artifact-paths.mjs';

const require=createRequire(import.meta.url),pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const paths=artifactPaths(pkg.version),args=process.argv.slice(2);
if(args.some(x=>!['--dir','--installer','--plan'].includes(x))||args.includes('--dir')&&args.includes('--installer'))throw Error('仅支持 --dir、--installer、--plan');
if(args.includes('--plan')){console.log(JSON.stringify(paths,null,2));process.exit(0);}
process.chdir(paths.project);
await fs.mkdir(paths.evidence,{recursive:true});
const temp=path.join(paths.project,'.build-cache','installer-temp');await fs.mkdir(temp,{recursive:true});
const env={...process.env,ELECTRON_BUILDER_CACHE:path.join(paths.project,'.build-cache','electron-builder'),TEMP:temp,TMP:temp};
const log=await fs.open(path.join(paths.evidence,`pack-${pkg.version}-${Date.now()}.log`),'wx');
async function run(script,argv=[]){
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script,...argv],{cwd:paths.project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    for(const [stream,dest] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',bytes=>{dest.write(bytes);appendFileSync(log.fd,bytes);});
    child.once('error',reject);child.once('close',resolve);
  });
  if(code!==0)throw Error('构建步骤失败：'+script+'，退出码 '+code);
}
try{
  try{await fs.access(path.join(paths.versionRelease,`Guagua-Setup-${pkg.version}.exe`));throw Error('本版本安装包已存在，请先核查版本保留范围');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(args.includes('--installer')){
    await assertCleanRuntime(paths.runtime);
    await run(path.join(paths.project,'tests/release-integrity.mjs'),[paths.runtime,path.join(paths.evidence,`release-integrity-${pkg.version}.json`)]);
  }else{
    try{await fs.access(paths.runtime);throw Error('本版本构建目录已存在；请核查保留范围后处理，或使用 pack:installer');}catch(e){if(e.code!=='ENOENT')throw e;}
    await run(path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),['build']);
    await run(path.join(paths.project,'scripts/prepare-source.mjs'));
  }
  const buildArgs=['--win',...(args.includes('--dir')?[]:['nsis']),'--x64','-c.directories.output='+paths.versionRelease];
  if(args.includes('--dir'))buildArgs.push('--dir');
  if(args.includes('--installer'))buildArgs.push('--prepackaged',paths.runtime);
  await run(require.resolve('electron-builder/cli.js'),buildArgs);
}finally{await log.close();}
