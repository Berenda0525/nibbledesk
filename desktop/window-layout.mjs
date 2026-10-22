import fs from 'node:fs/promises';
import path from 'node:path';
import {writeAtomic} from '../core/atomic-file.mjs';
export function fitWindow(saved,area){
 const width=Math.min(area.width,Math.max(780,Number(saved?.width)||1035)),height=Math.min(area.height,Math.max(580,Number(saved?.height)||691));
 const x=Number.isFinite(saved?.x)?Math.max(area.x,Math.min(saved.x,area.x+area.width-width)):Math.round(area.x+(area.width-width)/2),y=Number.isFinite(saved?.y)?Math.max(area.y,Math.min(saved.y,area.y+area.height-height)):Math.round(area.y+(area.height-height)/2);
 return {width,height,x,y};
}
export async function loadWindowBounds(dataDir,screen){let saved;try{saved=JSON.parse(await fs.readFile(path.join(dataDir,'window-layout.json'),'utf8'));}catch{}const area=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?screen.getDisplayNearestPoint({x:saved.x,y:saved.y}).workArea:screen.getPrimaryDisplay().workArea;return fitWindow(saved,area);}
export function rememberWindow(window,dataDir){let timer,queue=Promise.resolve();const save=()=>{if(window.isDestroyed()||window.isMinimized())return;const bounds=window.getNormalBounds();queue=queue.catch(()=>{}).then(()=>writeAtomic(path.join(dataDir,'window-layout.json'),JSON.stringify(bounds),'utf8')).catch(()=>{});};const schedule=()=>{clearTimeout(timer);timer=setTimeout(save,350);};window.on('resize',schedule);window.on('move',schedule);window.on('close',()=>{clearTimeout(timer);save();});}
