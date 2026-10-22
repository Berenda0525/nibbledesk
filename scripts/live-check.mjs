import fs from 'node:fs/promises';
import path from 'node:path';
import {generateChat,generateImage} from '../core/providers.mjs';
import {createFileStore} from '../desktop/file-store.mjs';
const credentialFile=process.argv[2];
if(!credentialFile)throw new Error('Provide a local credentials file explicitly');
const {apiKey}=JSON.parse(await fs.readFile(credentialFile,'utf8'));
if(!apiKey)throw new Error('No API key');
const records=[];
for(const model of ['claude-opus-5-5','gpt-6.1-sol','gemini-4-argon','deepseek-v4.1-flash','kimi-k3']){
 const started=Date.now();try{
  const result=await generateChat({provider:'apimart',model,key:apiKey,messages:[{role:'user',content:'Reply only OK.'}]});
  const record={model,status:'passed',answer:result.text.slice(0,60),ms:Date.now()-started};records.push(record);console.log(JSON.stringify(record));
 }catch(error){const record={model,status:'failed',error:error.message,ms:Date.now()-started};records.push(record);console.log(JSON.stringify(record));if(/余额|额度/.test(error.message))break;}
}
if(process.argv.includes('--image')&&!records.some(r=>/余额|额度/.test(r.error??''))){
 const model='gpt-image-2.5-flare';const started=Date.now();try{
  const images=await generateImage({provider:'apimart',model,key:apiKey,prompt:'A simple minimalist black four-point star on a warm white background, centered, flat vector style, no text.',onProgress:text=>console.log(text)});
  const store=await createFileStore(path.resolve('.test-data/live'));
  for(const image of images){const asset=await store.saveRemoteImage({...image,name:'live-image-check.png'});records.push({model,status:'passed',file:await store.resolve(asset.id),ms:Date.now()-started});}
 }catch(error){records.push({model,status:'failed',error:error.message,ms:Date.now()-started});}
 console.log(JSON.stringify(records.at(-1)));
}
await fs.mkdir('输出',{recursive:true});await fs.writeFile('输出/真实接口验证.json',JSON.stringify({date:new Date().toISOString(),records,volcano:'未提供火山方舟密钥，未做真实调用'},null,2));
