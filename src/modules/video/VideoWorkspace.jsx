import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Eye,EyeOff,Film,LoaderCircle,PictureInPicture2,Pin,Play,RefreshCw,Square,Video} from 'lucide-react';
import './video.css';

const platforms=[
 {id:'douyin',name:'抖音',mark:'抖',description:'在熟悉的推荐流中浏览视频'},
 {id:'xiaohongshu',name:'小红书',mark:'小',description:'浏览笔记，打开视频内容'},
 {id:'bilibili',name:'B站',mark:'哔',description:'观看收藏、关注和长视频'},
];
const suppressionMessages={
 'fullscreen':'检测到全屏窗口，播放器已暂停显示。',
 'do-not-disturb':'勿扰模式已开启，播放器已暂停显示。',
 'system-busy':'系统当前处于忙碌状态，播放器已暂停显示。',
 'detector-unavailable':'桌面状态检测暂不可用，播放器已暂停显示。',
};

/** 这里只呈现播放器状态。网页账户与窗口控制由隔离的影音模块管理。 */
export default function VideoWorkspace({call}){
 const [state,setState]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[opacity,setOpacity]=useState(100);
 const editingOpacity=useRef(false),current=useRef(null);
 const accept=next=>{if(!next)return;current.current=next;setState(next);if(!editingOpacity.current)setOpacity(next.settings.opacity);};
 useEffect(()=>{
  let active=true;
  const unsubscribe=window.stellar?.onEvent(event=>{if(active&&event.type==='video-state')accept(event.state);});
  call('video:getState').then(value=>{if(active)accept(value);}).catch(exception=>{if(active)setError(exception.message);});
  return()=>{active=false;unsubscribe?.();};
 },[]);
 async function perform(action,payload={}){
  if(busy)return;setBusy(action);setError('');
  try{accept(await call(action,payload));}catch(exception){setError(exception.message||'操作暂时未完成');if(action==='video:updateSettings'&&Object.hasOwn(payload,'opacity')&&current.current)setOpacity(current.current.settings.opacity);}finally{setBusy('');}
 }
 const act=name=>perform('video:action',{name});
 const preference=(key,value)=>perform('video:updateSettings',{[key]:value});
 const commitOpacity=event=>{editingOpacity.current=false;const value=Number(event.currentTarget.value);if(value!==state.settings.opacity)preference('opacity',value);};
 const disabled=!!busy||!state;
 return <section className="video-workspace" aria-label="影音工作区">
  <header className="module-heading"><div><h1>影音</h1><p>选择平台，在播放器里浏览，也可以收起为桌面小窗。</p></div><Video size={22} strokeWidth={1.5}/></header>
  <div className="video-platforms">{platforms.map(platform=><button key={platform.id} className={`video-platform ${state?.platform===platform.id?'selected':''}`} disabled={disabled} onClick={()=>perform('video:open',{platform:platform.id})} aria-label={`打开${platform.name}`}>
   <span className={`video-brand brand-${platform.id}`}><img src={`${import.meta.env.BASE_URL}assets/video/${platform.id}.ico`} alt=""/></span><strong>{platform.name}</strong><small>{platform.description}</small><ArrowUpRight size={16}/>
  </button>)}</div>
  {error&&<div className="video-error" role="alert"><span>{error}</span>{!state&&<button className="button" disabled={!!busy} onClick={()=>perform('video:getState')}>重新载入播放器</button>}</div>}
  {!state?(!error||busy?<div className="video-loading"><LoaderCircle className="spin" size={19}/><span>正在准备播放器…</span></div>:null):<>
   <section className="video-session" aria-label="播放器控制">
    <div className="video-session-heading"><span className="video-session-icon"><Film size={21}/></span><div><h2>{state.opened?state.platformName:'尚未打开播放器'}</h2><p>{state.suppressed?(suppressionMessages[state.suppressed]||'桌面状态暂不允许显示播放器。'):state.error|| (state.loading?'页面正在加载…':state.opened?(state.visible?(state.floating?'视频悬浮窗':'平台浏览窗口'):'播放器已隐藏'):'从上方选择一个视频平台')}</p></div>{state.loading&&<LoaderCircle className="spin" size={17}/>}</div>
    <div className="video-actions">
     <button className="button primary" disabled={disabled||!state.opened||!!state.suppressed} onClick={()=>act(state.visible?'hide':'show')}>{state.visible?<EyeOff size={15}/>:<Eye size={15}/>} {state.visible?'隐藏并暂停':'显示播放器'}</button>
     <button className="button" disabled={disabled||!state.opened||!!state.suppressed} onClick={()=>act(state.floating?'page':'float')}>{state.floating?<ArrowUpRight size={15}/>:<PictureInPicture2 size={15}/>} {state.floating?'回到网页':'视频小窗'}</button>
     <button className="button" disabled={disabled||!state.opened} onClick={()=>act('reload')}><RefreshCw size={15}/> 刷新</button>
     <button className="text-button" disabled={disabled||!state.opened} onClick={()=>act('close')}><Square size={13}/> 关闭播放器</button>
    </div>
   </section>
   <section className="video-preferences" aria-label="影音设置"><h2>播放偏好</h2>
    <label className="preference-row"><span className="preference-symbol"><Pin size={18}/></span><span><strong>悬浮置顶</strong><small>让视频小窗显示在普通窗口上方。</small></span><input type="checkbox" role="switch" aria-label="悬浮置顶" checked={state.settings.topmost} disabled={disabled} onChange={event=>preference('topmost',event.target.checked)}/></label>
    <label className="video-opacity"><span><strong>窗口不透明度</strong><small>仅调整视频小窗</small></span><input type="range" aria-label="窗口不透明度" min="20" max="100" step="1" value={opacity} disabled={disabled} onPointerDown={()=>{editingOpacity.current=true;}} onChange={event=>setOpacity(Number(event.target.value))} onPointerUp={commitOpacity} onKeyUp={commitOpacity}/><output>{opacity}%</output></label>
    <label className="preference-row"><span className="preference-symbol"><Play size={18}/></span><span><strong>影音快捷键</strong><small>Alt + Q 隐藏并暂停，再按一次恢复。</small></span><input type="checkbox" role="switch" aria-label="影音快捷键" checked={state.settings.shortcutEnabled} disabled={disabled} onChange={event=>preference('shortcutEnabled',event.target.checked)}/></label>
   </section>
   <p className="video-help">首次使用请在平台页面自行登录。三个平台分别保留登录状态，关闭播放器后可以从这里重新打开。</p>
  </>}
 </section>;
}
