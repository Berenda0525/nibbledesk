export const DESKTOP_DEFAULTS=Object.freeze({islandEnabled:true,closeToIsland:true,doNotDisturb:false,notificationsEnabled:false});
export function normalizeDesktop(value={}){return Object.fromEntries(Object.entries(DESKTOP_DEFAULTS).map(([key,fallback])=>[key,typeof value?.[key]==='boolean'?value[key]:fallback]));}
export const VOICE_DEFAULTS=Object.freeze({enabled:false,language:'zh'});
export function updateProfile(current, input={}) {
  const next={displayName:'我',...current};
  next.desktop=normalizeDesktop(current?.desktop);
  if(input.desktop!==undefined){
    if(!input.desktop||typeof input.desktop!=='object'||Array.isArray(input.desktop))throw new Error('桌面工具设置无效');
    for(const key of Object.keys(DESKTOP_DEFAULTS))if(input.desktop[key]!==undefined){if(typeof input.desktop[key]!=='boolean')throw new Error('桌面工具开关无效');next.desktop[key]=input.desktop[key];}
  }
  if(input.voice!==undefined){
    if(!input.voice||typeof input.voice!=='object'||Array.isArray(input.voice))throw new Error('语音设置无效');
    next.voice={...VOICE_DEFAULTS,...current?.voice};
    if(input.voice.enabled!==undefined){if(typeof input.voice.enabled!=='boolean')throw new Error('语音开关无效');next.voice.enabled=input.voice.enabled;}
    if(input.voice.language!==undefined){if(!['auto','zh','en'].includes(input.voice.language))throw new Error('语音语言无效');next.voice.language=input.voice.language;}
  }
  if(input.theme!==undefined){if(!['dark','light'].includes(input.theme))throw new Error('主题设置无效');next.theme=input.theme;}
  if(input.displayName!==undefined) next.displayName=String(input.displayName).trim().slice(0,40)||'我';
  if(input.removeAvatar) delete next.avatarUrl;
  if(input.avatarData){
    const {base64,mime}=input.avatarData;
    if(typeof base64!=='string'||base64.length>1400000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('头像图片无效或超过 1 MB');
    const bytes=Buffer.from(base64,'base64');
    const png=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(bytes.length>1024*1024||!((mime==='image/png'&&png)||(mime==='image/jpeg'&&jpeg)))throw new Error('头像仅支持 PNG 或 JPEG 图片');
    next.avatarUrl=`data:${mime};base64,${base64}`;
  }
  return next;
}
