import {app,nativeImage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../desktop/assets');
app.whenReady().then(async()=>{try{
  const source=nativeImage.createFromPath(path.join(root,'guagua-icon.png'));
  if(source.isEmpty())throw new Error('应用图标无法读取');
  const sizes=[16,20,24,32,40,48,64,128,256];
  const images=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG());
  const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  for(let i=0;i<sizes.length;i++){const p=6+i*16;header[p]=header[p+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(images[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=images[i].length;}
  await fs.writeFile(path.join(root,'icon.ico'),Buffer.concat([header,...images]));
  console.log(JSON.stringify({sourceSize:source.getSize(),icoSizes:sizes}));
}finally{app.quit();}}).catch(error=>{console.error(error);app.exit(1);});
