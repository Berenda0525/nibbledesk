import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,maxBuffer:20*1024*1024});
if(path.resolve(git('rev-parse','--show-toplevel').toString().trim())!==root)throw Error('请在独立的瓜瓜 Git 仓库中运行，不能使用上级仓库');
const staged=process.argv.includes('--staged');
const files=git('ls-files','-z').toString('utf8').split('\0').filter(Boolean);
const allowed=new Set(['core','desktop','shared','src','public','scripts','tests','docs','resources','.github']);
const rootFiles=new Set(['README.md','LICENSE','NOTICE.txt','SECURITY.md','CONTRIBUTING.md','.gitignore','.gitattributes','package.json','package-lock.json','index.html','vite.config.js']);
const findings=[];let bytes=0,binaryFiles=0;
for(const file of files){
 const segments=file.split('/');
 if(!allowed.has(segments[0])&&!rootFiles.has(file))findings.push({file,rule:'outside-public-manifest'});
 if(segments.some(s=>['data','cache','private','node_modules','.build-cache','.test-data','.local-data','输出','资料'].includes(s))||/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|pfx|sqlite\w*|db|exe|dll|bin|zip|7z|pptx|docx|xlsx|pdf)$/i.test(file))findings.push({file,rule:'private-or-generated-file'});
 const buffer=staged?git('show',':'+file):await fs.readFile(path.join(root,file));bytes+=buffer.length;
 if(buffer.length>5*1024*1024)findings.push({file,rule:'oversized-file'});
 if(/\.(?:png|ico|jpe?g)$/i.test(file)){binaryFiles++;continue;}
 const lines=buffer.toString('utf8').split(/\r?\n/);
 const rules={
  credential:/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  privateKey:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  homePath:/[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b|Default\b)[^\\/\s"']+/i,
  jwt:/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  literal:/(?:api[_-]?key|access_token|refresh_token|client_secret|password)\s*[:=]\s*["']([^"'\r\n]{12,})["']/i,
 };
 for(const [index,line] of lines.entries())for(const [rule,regex] of Object.entries(rules)){
  const match=regex.exec(line);if(!match)continue;
  // These exact strings are fixtures for the local HTTP test server, not service credentials.
  if(rule==='literal'&&file.startsWith('tests/')&&['local-test-key','local-mock-key'].includes(match[1]))continue;
  findings.push({file,line:index+1,rule});
 }
}
console.log(JSON.stringify({passed:findings.length===0,files:files.length,bytes,binaryFiles,findings},null,2));
if(findings.length)process.exitCode=1;
