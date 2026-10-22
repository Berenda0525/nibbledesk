import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

function writableDirectory(directory){
  let probe;
  try{
    fs.mkdirSync(directory,{recursive:true});
    probe=path.join(directory,`.guagua-write-check-${randomUUID()}`);
    fs.writeFileSync(probe,'',{flag:'wx'});
    fs.unlinkSync(probe);
  }catch(error){
    throw new Error(`瓜瓜无法写入数据目录：\n${directory}\n\n请把软件安装到当前账户可写入的文件夹，例如 E:\\瓜瓜，再启动软件。`,{cause:error});
  }
}

export function configureRuntimePaths(app,{env=process.env,developmentDataDir}={}){
  if(app.isReady())throw new Error('数据目录必须在软件启动前设置');
  const installationDir=app.isPackaged?path.dirname(app.getPath('exe')):undefined;
  const dataDir=app.isPackaged?path.join(installationDir,'data'):path.resolve(env.STAR_CHAT_TEST_DATA_DIR||developmentDataDir||'.local-data');
  const cacheDir=app.isPackaged?path.join(installationDir,'cache'):path.join(dataDir,'cache');
  const httpCache=path.join(cacheDir,'http');
  const paths={userData:dataDir,sessionData:path.join(cacheDir,'session'),logs:path.join(cacheDir,'logs'),crashDumps:path.join(cacheDir,'crash-dumps'),temp:path.join(cacheDir,'temp')};
  for(const directory of new Set([dataDir,cacheDir,httpCache,...Object.values(paths)]))writableDirectory(directory);
  for(const [name,directory]of Object.entries(paths))app.setPath(name,directory);
  app.commandLine.appendSwitch('disk-cache-dir',httpCache);
  app.commandLine.appendSwitch('log-file',path.join(paths.logs,'chromium.log'));
  env.TEMP=paths.temp;env.TMP=paths.temp;env.TMPDIR=paths.temp;
  return {installationDir,dataDir,cacheDir,...paths};
}
