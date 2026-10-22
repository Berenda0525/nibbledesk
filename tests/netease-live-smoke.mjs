import fs from 'node:fs/promises';
import path from 'node:path';
import {createNeteaseRuntime} from '../desktop/modules/music/netease.mjs';
const dataDir=await fs.mkdtemp(path.join(process.cwd(),'.test-data/netease-live-')),runtime=createNeteaseRuntime({dataDir});
try{const result=await runtime.request('/cloudsearch',{keywords:'Chopin',type:'1',limit:'2'});const count=result.body?.result?.songs?.length||0;const report={passed:result.status===200&&count>0,dataDir,status:result.status,code:result.body?.code,songCount:count,accountLoginTested:false,memberPlaybackTested:false};await fs.writeFile(path.join(dataDir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}catch(e){console.log(JSON.stringify({passed:false,dataDir,error:e.message}));process.exitCode=1;}finally{await runtime.dispose();}
