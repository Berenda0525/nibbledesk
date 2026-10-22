import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const TRANSIENT_CODES = new Set(['EPERM','EBUSY','EACCES']);
const RETRY_DELAYS = [25,50,100,200,300,400];
const RETRY_WINDOW_MS = 1500;

// Windows 杀毒/索引程序可能短暂占用目标。始终使用 rename 原子替换，绝不先删原文件。
export async function renameAtomic(source,target){
  const deadline=performance.now()+RETRY_WINDOW_MS;
  for(let attempt=0;;attempt++){
    try{return await fs.rename(source,target);}
    catch(error){
      const wait=RETRY_DELAYS[attempt];
      if(!TRANSIENT_CODES.has(error.code)||wait===undefined||performance.now()+wait>=deadline)throw error;
      await delay(wait);
      if(performance.now()>=deadline)throw error;
    }
  }
}

// 调用方按文件串行保存；失败时保留 .tmp，原文件仍可读取。
export async function writeAtomic(target,data,options='utf8'){
  await fs.mkdir(path.dirname(target),{recursive:true});
  const temporary=target+'.tmp';
  await fs.writeFile(temporary,data,options);
  await renameAtomic(temporary,target);
}
