import fs from 'node:fs/promises';
import path from 'node:path';
import {validProviderId} from '../core/provider-config.mjs';
import {writeAtomic} from '../core/atomic-file.mjs';

export async function createKeyStore(dataDir,safeStorage){
  const filename=path.join(dataDir,'credentials.json');
  await fs.mkdir(dataDir,{recursive:true});
  let stored={};
  try{stored=JSON.parse(await fs.readFile(filename,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('密钥配置读取失败，请保留数据目录并联系维护人员');}
  let pending=Promise.resolve();
  const valid=provider=>{if(!validProviderId(provider))throw new Error('不支持的模型平台');};
  const save=()=>{const body=JSON.stringify(stored);pending=pending.catch(()=>{}).then(()=>writeAtomic(filename,body,'utf8'));return pending;};
  return {
    async get(provider){valid(provider);if(!stored[provider])return '';try{return safeStorage.decryptString(Buffer.from(stored[provider],'base64'));}catch{throw new Error('此密钥无法在当前 Windows 账户解密，请重新输入');}},
    async set(provider,key){valid(provider);if(typeof key!=='string'||!key.trim()||key.length>4096)throw new Error('请输入有效的 API Key');if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 密钥加密暂不可用，请重启应用后再试');stored[provider]=safeStorage.encryptString(key.trim()).toString('base64');await save();},
    async remove(provider){valid(provider);delete stored[provider];await save();}
  };
}
