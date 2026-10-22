import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// 发行源码使用固定目录清单；运行数据、密钥、构建缓存不参与遍历。
const root=process.cwd();
const destination=path.join(root,'.build-cache','release-source-current');
const folders=['shared','src','core','desktop','public','scripts','tests'];
const extensions=new Set(['.mjs','.cjs','.js','.jsx','.ts','.tsx','.css','.html','.json','.svg','.png','.ico','.cs','.ps1','.nsh']);
const files=[];
async function collect(relative){
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
    const name=path.posix.join(relative,entry.name);
    if(entry.isSymbolicLink())throw new Error(`源码目录不支持链接：${name}`);
    if(entry.isDirectory())await collect(name);
    else if(entry.isFile()&&(extensions.has(path.extname(entry.name))||/\b(?:LICENSE|NOTICE|COPYING)\b/i.test(entry.name)))files.push(name);
  }
}
for(const folder of folders)await collect(folder);
files.push('package.json','package-lock.json','index.html','vite.config.js','LICENSE','NOTICE.txt');
const notes=Object.fromEntries(['README.md','SECURITY.md','CONTRIBUTING.md','docs/BUILD.md','docs/THIRD_PARTY.md'].map(file=>[file,file]));
const expected=new Set([...files,...Object.keys(notes),'source-manifest.json']);
// 更新快照前拒绝清单外残留，避免曾经的源码或手动放入的文件进入发行包。
async function checkDestination(relative=''){
  const directory=path.join(destination,relative);
  try{if((await fs.lstat(directory)).isSymbolicLink())throw new Error('源码快照目录不能为链接');}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.posix.join(relative,entry.name);
    if(entry.isSymbolicLink())throw new Error(`源码快照不支持链接：${file}`);
    if(entry.isDirectory())await checkDestination(file);
    else if(!expected.has(file))throw new Error(`源码快照存在清单外文件，请核查后再构建：${file}`);
  }
}
await checkDestination();
const records=[];
for(const file of [...new Set(files)].sort()){
  const buffer=await fs.readFile(path.join(root,file));
  if(/\.(?:mjs|cjs|js|jsx|ts|tsx|json|ps1)$/.test(file)&&/\bsk-[A-Za-z0-9]{24,}/.test(buffer.toString('utf8')))throw new Error(`源码包含疑似调用密钥：${file}`);
  const output=path.join(destination,file);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,buffer);
  records.push({file,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
}
for(const [name,source]of Object.entries(notes)){
  const buffer=await fs.readFile(path.join(root,source));
  await fs.mkdir(path.dirname(path.join(destination,name)),{recursive:true});
  await fs.writeFile(path.join(destination,name),buffer);
  records.push({file:name,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
}
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
await fs.writeFile(path.join(destination,'source-manifest.json'),JSON.stringify({version,createdAt:new Date().toISOString(),files:records},null,2));
console.log(JSON.stringify({version,destination,files:records.length}));
