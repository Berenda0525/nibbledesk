import path from 'node:path';
import {lstat,realpath,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export const TASK_LIMITS=Object.freeze({fileBytes:25*1024*1024,textBytes:2*1024*1024,readBytes:250000,files:500,commandMs:60000,outputBytes:120000});
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function taskIdentity(value){if(typeof value!=='string'||!value.trim()||value.length>200)throw Error('任务身份无效');return sha256(value).slice(0,24);}
export function relativeTaskPath(value,{allowRoot=false}={}){
  if(typeof value!=='string'||value.length>240||/[\x00-\x1f<>:"|?*]/.test(value)||path.isAbsolute(value)||path.win32.isAbsolute(value))throw Error('请使用工作区内相对路径');
  const parts=value.replaceAll('\\','/').split('/');
  if(parts.some(p=>p==='..'||p.endsWith('.')&&p!=='.'||p.endsWith(' ')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('文件路径不允许');
  const clean=parts.filter(p=>p&&p!=='.').join('/');
  if(!clean&&!allowRoot)throw Error('文件路径为空');
  return clean;
}
export async function checkedTaskPath(root,value,{allowRoot=false,createParents=false}={}){
  const relative=relativeTaskPath(value,{allowRoot});const base=path.resolve(root);
  const rootStat=await lstat(base);if(rootStat.isSymbolicLink()||!rootStat.isDirectory()||path.resolve(await realpath(base))!==base)throw Error('工作区不是普通目录');
  const parts=relative.split('/').filter(Boolean);let current=base;
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);
    let stat;try{stat=await lstat(current);}catch(error){if(error.code!=='ENOENT')throw error;if(createParents&&i<parts.length-1){await mkdir(current);stat=await lstat(current);}else continue;}
    if(stat.isSymbolicLink()||(stat.isFile()&&stat.nlink>1))throw Error('工作区不允许链接文件');
    if(i<parts.length-1&&!stat.isDirectory())throw Error('路径父级不是目录');
    if(path.resolve(await realpath(current))!==current)throw Error('工作区路径已改变');
  }
  return current;
}
export function childEnvironment(workspace,source=process.env){
  const env={ELECTRON_RUN_AS_NODE:'1',NODE_NO_WARNINGS:'1',TEMP:workspace,TMP:workspace};
  for(const key of ['SystemRoot','WINDIR','ComSpec','PATHEXT'])if(source[key])env[key]=source[key];
  return env;
}
export async function terminateOwnedProcess(child){
  if(!child?.pid||child.exitCode!==null)return;
  if(process.platform==='win32')await new Promise(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',resolve);killer.on('close',resolve);});
  else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
}
async function inspectTree(root){
  let count=0;const visit=async(relative='')=>{for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){if(++count>TASK_LIMITS.files)throw Error('工作区文件数量超过限制');const rel=relative?relative+'/'+entry.name:entry.name;await checkedTaskPath(root,rel);if(entry.isDirectory())await visit(rel);}};await visit();
}
export async function runWorkspaceNode({workspace,file,mode='test',nodeExecutable=process.execPath,signal,requestApproval,onEvent=()=>{},timeoutMs=TASK_LIMITS.commandMs}){
  if(!['check','test','run'].includes(mode))throw Error('运行模式无效');
  const relative=relativeTaskPath(file);if(!/\.[cm]?js$/i.test(relative))throw Error('只支持 JavaScript 文件');
  const target=await checkedTaskPath(workspace,relative);const stat=await lstat(target);if(!stat.isFile()||stat.size>TASK_LIMITS.textBytes)throw Error('执行文件无效');
  signal?.throwIfAborted();await inspectTree(workspace);
  const before=sha256(await readFile(target));
  if(mode!=='check'){
    const warning='程序仅获工作区文件读写权限，不能启动子进程；代码可能联网。请仅运行你信任的内容。';
    const request={type:'execute',tool:'run_node',mode,path:relative,workspace,cwd:workspace,command:`node --permission --allow-fs-read=<当前工作区> --allow-fs-write=<当前工作区> --no-addons --disable-proto=throw --max-old-space-size=256 ${mode==='test'?'--test --test-isolation=none ':''}${JSON.stringify('./'+relative)}`,description:`${mode==='test'?'运行测试':'运行代码'}：${relative}`,warning,reason:warning,codeHash:before,sourcePreview:(await readFile(target,'utf8')).slice(0,16000)};
    const allowed=await new Promise((resolve,reject)=>{const abort=()=>{signal?.removeEventListener('abort',abort);reject(signal.reason??Error('任务已停止'));};signal?.addEventListener('abort',abort,{once:true});Promise.resolve().then(()=>requestApproval?.({...request,signal})).then(value=>{signal?.removeEventListener('abort',abort);resolve(value);},error=>{signal?.removeEventListener('abort',abort);reject(error);});if(signal?.aborted)abort();});signal?.throwIfAborted();if(allowed!==true&&allowed?.approved!==true)throw Error('用户未允许这次代码执行');
    await checkedTaskPath(workspace,relative);await inspectTree(workspace);if(sha256(await readFile(target))!==before)throw Error('审批后文件已变化，请重新运行');
  }
  const args=['--permission',`--allow-fs-read=${workspace}`,`--allow-fs-write=${workspace}`,'--no-addons','--disable-proto=throw','--max-old-space-size=256'];
  if(mode==='check')args.push('--check');else if(mode==='test')args.push('--test','--test-isolation=none');
  args.push(mode==='test'?'./'+relative:target);signal?.throwIfAborted();
  return await new Promise((resolve,reject)=>{
    const child=spawn(nodeExecutable,args,{cwd:workspace,env:childEnvironment(workspace),windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',failure;let stopping;
    const stop=error=>{failure??=error;stopping??=terminateOwnedProcess(child);};
    const abort=()=>stop(signal.reason??new Error('任务已停止'));
    const timer=setTimeout(()=>stop(Error('代码运行超时')),Math.min(Math.max(timeoutMs,100),TASK_LIMITS.commandMs));
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const append=(kind,chunk)=>{const text=chunk.toString();if(kind==='stdout')stdout+=text;else stderr+=text;if(stdout.length+stderr.length>TASK_LIMITS.outputBytes)stop(Error('程序输出超过限制'));else onEvent({type:'output',stream:kind,text});};
    child.stdout.on('data',chunk=>append('stdout',chunk));child.stderr.on('data',chunk=>append('stderr',chunk));
    child.on('error',error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(error);});
    child.on('close',async(code)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);await stopping;if(failure)reject(failure);else resolve({mode,path:relative,exitCode:code,passed:code===0,stdout:stdout.slice(-TASK_LIMITS.outputBytes),stderr:stderr.slice(-TASK_LIMITS.outputBytes),codeHash:before});});
  });
}
export function createWorkspaceTools({workspace,historyDir,nodeExecutable,signal,requestApproval,onEvent=()=>{},onArtifact=()=>{}}){
  return async function execute(name,args){
    signal?.throwIfAborted();
    if(!args||typeof args!=='object'||Array.isArray(args))throw Error('工具参数无效');
    if(name==='workspace_list'){
      const target=await checkedTaskPath(workspace,args.path??'.',{allowRoot:true});return {files:(await readdir(target,{withFileTypes:true})).slice(0,150).map(e=>({name:e.name,directory:e.isDirectory(),link:e.isSymbolicLink()}))};
    }
    if(name==='workspace_read'){
      const target=await checkedTaskPath(workspace,args.path);const stat=await lstat(target);if(!stat.isFile()||stat.size>TASK_LIMITS.readBytes)throw Error('文件过大或不支持文本读取');const bytes=await readFile(target);return {path:args.path,text:bytes.toString('utf8'),hash:sha256(bytes)};
    }
    if(name==='workspace_write'||name==='workspace_edit'){
      const target=await checkedTaskPath(workspace,args.path,{createParents:true});let old;try{old=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
      let content=args.content;
      if(name==='workspace_edit'){
        if(old===undefined||typeof args.oldText!=='string'||!args.oldText||typeof args.newText!=='string')throw Error('修改参数无效');const text=old.toString('utf8');if(text.split(args.oldText).length!==2)throw Error('原文必须在文件中准确出现一次');content=text.replace(args.oldText,args.newText);
      }else if(old!==undefined&&args.expectedHash!==sha256(old))throw Error('覆盖前请先读取文件，并提供 expectedHash');
      if(typeof content!=='string'||Buffer.byteLength(content)>TASK_LIMITS.textBytes)throw Error('写入内容无效或过大');
      if(old!==undefined&&historyDir){await mkdir(historyDir,{recursive:true});await writeFile(path.join(historyDir,Date.now()+'-'+randomUUID()+'.bak'),old,{flag:'wx'});}
      signal?.throwIfAborted();await checkedTaskPath(workspace,args.path);await writeFile(target,content,{flag:old===undefined?'wx':'w',signal});return {path:args.path,bytes:Buffer.byteLength(content),hash:sha256(content)};
    }
    if(name==='run_node')return runWorkspaceNode({workspace,file:args.path,mode:args.mode,nodeExecutable,signal,requestApproval,onEvent});
    if(name==='deliver_file'){
      const target=await checkedTaskPath(workspace,args.path);const stat=await lstat(target);if(!stat.isFile()||stat.size>TASK_LIMITS.fileBytes)throw Error('交付文件无效或超过 25 MB');const artifact={name:path.basename(target),path:target,relativePath:relativeTaskPath(args.path),bytes:stat.size,sha256:sha256(await readFile(target))};signal?.throwIfAborted();onArtifact(artifact);return artifact;
    }
    throw Error('工具未启用');
  };
}
