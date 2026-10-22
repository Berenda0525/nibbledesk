export const DEFAULT_DESKTOP_SETTINGS=Object.freeze({islandEnabled:true,closeToIsland:true,doNotDisturb:false,notificationsEnabled:false});

export function normalizeDesktopSettings(input={}){
  input=input?.desktop??input;
  const result={...DEFAULT_DESKTOP_SETTINGS};
  for(const key of Object.keys(result))if(typeof input?.[key]==='boolean')result[key]=input[key];
  return result;
}

export function overlaySuppression(settings,probe){
  if(settings.doNotDisturb)return 'do-not-disturb';
  if(!probe?.available)return 'detector-unavailable';
  if(probe.fullscreen)return 'fullscreen';
  if(probe.notificationState!==5)return 'system-busy';
  return null;
}

export function islandGeometry(display){
  const bounds=display?.bounds;
  if(!bounds||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key]))||bounds.width<200||bounds.height<180)throw new Error('主屏尺寸无效');
  const width=Math.min(468,Math.floor(bounds.width));
  const height=Math.min(490,Math.floor(bounds.height));
  return {x:Math.round(bounds.x+(bounds.width-width)/2),y:Math.round(bounds.y),width,height,surfaceWidth:width-36,surfaceHeight:height-24,compactWidth:176,compactHeight:32};
}

export function islandHitTest(point,geometry,expanded){
  if(!point||!geometry)return false;
  const width=expanded?geometry.surfaceWidth:geometry.compactWidth;
  const height=expanded?geometry.surfaceHeight:geometry.compactHeight;
  const left=geometry.x+(geometry.width-width)/2,top=geometry.y;
  const x=point.x-left,y=point.y-top;
  if(x<0||x>width||y<0||y>height)return false;
  const radius=expanded?26:18;
  if(y<=height-radius||x>=radius&&x<=width-radius)return true;
  return Math.hypot(x<(width/2)?x-radius:x-(width-radius),y-(height-radius))<=radius;
}

export function createIslandHover({openDelay=90,closeDelay=420}={}){
  let expanded=false,enteredAt=null,leftAt=null,holdUntil=0;
  return {
    get expanded(){return expanded;},
    set(value){expanded=!!value;enteredAt=null;leftAt=null;holdUntil=0;return expanded;},
    hold(now,delay=1000){holdUntil=Math.max(holdUntil,now+delay);},
    release(){holdUntil=0;},
    update(inside,now){
      if(inside){leftAt=null;if(!expanded){enteredAt??=now;if(now-enteredAt>=openDelay){expanded=true;enteredAt=null;}}}
      else{enteredAt=null;if(expanded){leftAt??=now;if(now-leftAt>=closeDelay&&now>=holdUntil){expanded=false;leftAt=null;}}}
      return expanded;
    }
  };
}

export function normalizeAgents(input){
  if(!Array.isArray(input))return [];
  const seen=new Set();
  return input.filter(agent=>agent&&typeof agent.id==='string'&&/^[\w-]{1,80}$/.test(agent.id)&&!seen.has(agent.id)&&seen.add(agent.id)).slice(0,32).map(agent=>({id:agent.id,avatarKey:String(agent.avatarKey||agent.id).slice(0,80),name:String(agent.name||agent.id).slice(0,50),model:String(agent.model||'').slice(0,160)}));
}

export function validateQuickInput(payload,agents){
  if(!payload||typeof payload!=='object'||!agents.some(agent=>agent.id===payload.agentId))throw new Error('请选择一个助手');
  const ids=payload.attachmentIds??[];if(!Array.isArray(ids)||ids.length>8||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id)))throw new Error('附件参数无效');
  if(typeof payload.text!=='string'||(!payload.text.trim()&&!ids.length)||payload.text.length>12000)throw new Error('请输入文字或添加文件，文字最多 12000 字');
  return {agentId:payload.agentId,text:payload.text.trim(),...(ids.length?{attachmentIds:[...new Set(ids)]}:{})};
}

export function validateQuickFiles(payload,agents){
 if(!payload||!agents.some(a=>a.id===payload.agentId))throw new Error('请选择一个助手');
 if(!Array.isArray(payload.files)||payload.files.length<1||payload.files.length>8)throw new Error('一次可添加 1 至 8 个文件');
 let total=0;const files=payload.files.map(file=>{if(!file||typeof file.name!=='string'||!file.name.trim()||file.name.length>240||typeof file.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw new Error('文件数据无效');const bytes=Math.floor(file.base64.length*3/4);if(bytes>20*1024*1024+2)throw new Error('每个文件最多 20 MB');total+=bytes;return {name:file.name,mime:typeof file.mime==='string'?file.mime.slice(0,100):'',base64:file.base64};});
 if(total>40*1024*1024)throw new Error('一次添加的文件总大小最多 40 MB');return {agentId:payload.agentId,files};
}
export function normalizeMusicState(value){if(!value||typeof value!=='object')return null;return {playing:value.playing===true,title:String(value.title||'').slice(0,120),artist:String(value.artist||'').slice(0,120),lyric:String(value.lyric||'').slice(0,240),bands:Array.from({length:5},(_,i)=>Math.max(0,Math.min(1,Number(value.bands?.[i])||0)))};}

export function normalizeChatSnapshot(input,agents){
  if(!input||!agents.some(agent=>agent.id===input.agentId))throw new Error('快聊会话无效');
  const chatId=typeof input.chatId==='string'&&/^[\w-]{1,120}$/.test(input.chatId)?input.chatId:null;
  const messages=(Array.isArray(input.messages)?input.messages:[]).filter(message=>message&&['user','assistant'].includes(message.role)).slice(-30).map((message,index)=>({id:String(message.id??index).slice(0,120),role:message.role,attachments:(Array.isArray(message.attachments)?message.attachments:[]).slice(0,8).map(a=>({id:String(a.id||'').slice(0,100),name:String(a.name||'文件').slice(0,160)})),content:typeof message.content==='string'?(message.content.length>24000?message.content.slice(0,24000)+'\n\n（更多内容可在工作台查看）':message.content):''}));
  return {models:(Array.isArray(input.models)?input.models:[]).slice(0,100).filter(m=>typeof m.id==='string').map(m=>({id:m.id.slice(0,200),name:String(m.name||m.id).slice(0,200)})),voiceEnabled:input.voiceEnabled===true,agentId:input.agentId,chatId,messages,running:input.running===true,model:String(input.model||agents.find(agent=>agent.id===input.agentId)?.model||'').slice(0,160),error:typeof input.error==='string'?input.error.slice(0,500):''};
}
