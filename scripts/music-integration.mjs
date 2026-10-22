import {parse} from '@babel/parser';

/** Build-time presentation changes; upstream source and license stay in the source bundle. */
export function integrateMusicSource(code,id){
 const file=id.replaceAll('\\','/').split('?')[0];
 if(!file.includes('/src/')||! /\.[jt]sx?$/.test(file))return null;
 if(file.endsWith('/components/ponder/PonderHost.tsx')||file.endsWith('/components/ponder/PagePonderTouchButton.tsx'))return 'export default function MusicGuide(){return null;}';
 if(file.endsWith('/components/modal/settings/pages/HelpPage.tsx'))return `import React from 'react';export default function HelpPage(){return <section style={{padding:24,lineHeight:1.9}}><h2>音乐使用说明</h2><p>在歌单、电台、探索、专辑与本地音乐之间切换。点击歌曲开始播放，播放时桌面刘海同步显示歌词。</p><p>在线账户在右下角头像中配置；本地音乐支持导入文件夹。</p><p>版本：瓜瓜 1.7.0 · 开源组件、许可证与对应源码随安装包提供。</p></section>;}`;
 if(!/Folia|思索/.test(code))return null;
 const ast=parse(code,{sourceType:'module',plugins:['typescript','jsx']}),edits=[];
 function walk(node,parent){
  if(!node||typeof node!=='object')return;
  if(node.type==='StringLiteral'&&/Folia|思索/.test(node.value)&&! /^(?:https?:|\.{0,2}\/|Folia Noto)/.test(node.value)&&!((parent?.type==='ObjectProperty'&&parent.key===node)||/^(?:Import|Export)/.test(parent?.type||''))){
   edits.push([node.start,node.end,JSON.stringify(node.value.replaceAll('Folia','音乐').replaceAll('思索','操作说明'))]);return;
  }
  if(node.type==='JSXText'&&/Folia|思索/.test(node.value)){edits.push([node.start,node.end,node.value.replaceAll('Folia','音乐').replaceAll('思索','操作说明')]);return;}
  for(const [key,value]of Object.entries(node)){if(['loc','comments','tokens','extra'].includes(key))continue;if(Array.isArray(value))for(const child of value)walk(child,node);else if(value&&typeof value==='object')walk(value,node);}
 }
 walk(ast,null);
 for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,start)+text+code.slice(end);
 return edits.length?{code,map:null}:null;
}
