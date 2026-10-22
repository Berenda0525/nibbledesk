import Dropdown from './Dropdown.jsx';
import React,{useEffect,useState} from 'react';
import {Monitor,Mic,Bell} from 'lucide-react';

const desktopDefaults={islandEnabled:true,closeToIsland:true,doNotDisturb:false,notificationsEnabled:false};
export default function DesktopSettings({state,call,notify}){
 const desktop={...desktopDefaults,...state.profile?.desktop},voice={enabled:false,language:'zh',...state.profile?.voice};
 const [busy,setBusy]=useState(''),[notice,setNotice]=useState(null);
 useEffect(()=>setNotice(null),[state.desktopStatus?.notifications]);
 const notification=notice||state.desktopStatus?.notifications;
 const requestAccess=async()=>{setBusy('permission');try{setNotice(await call('requestNotificationAccess'));}catch{}finally{setBusy('');}};
 const update=async(section,key,value)=>{setBusy(key);try{await call('updateProfile',{[section]:{...(section==='desktop'?desktop:voice),[key]:value}});notify('设置已保存。');}catch{}finally{setBusy('');}};
 const notificationControls=<div className="notification-permission"><p>{notification?.message||'请主动授权 Windows 通知访问后使用。'}</p><div><button className="button" disabled={!!busy} onClick={requestAccess}>{busy==='permission'?'等待系统授权…':'请求通知访问权限'}</button><button className="text-button" onClick={()=>call('openNotificationSettings').catch(()=>{})}>打开系统设置</button></div></div>;
 const toggle=(section,key,title,description,icon)=> <label className="preference-row"><span className="preference-symbol">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" role="switch" aria-label={title} checked={!!(section==='desktop'?desktop:voice)[key]} disabled={!!busy} onChange={e=>update(section,key,e.target.checked)}/></label>;
 return <div className="desktop-settings"><section><h3>桌面助手</h3>{toggle('desktop','islandEnabled','桌面刘海','在屏幕顶部快速打开聊天与任务。',<Monitor size={18}/>)}{desktop.islandEnabled&&toggle('desktop','closeToIsland','关闭窗口后保留刘海','点击窗口关闭按钮后，仍可从顶部继续使用。',<Monitor size={18}/>)}{toggle('desktop','notificationsEnabled','桌面通知','在顶部刘海展示微信、飞书的新系统通知。',<Bell size={18}/>)}{desktop.notificationsEnabled&&notificationControls}{toggle('desktop','doNotDisturb','勿扰模式','暂停桌面刘海和通知展示。',<Bell size={18}/>)}</section><section><h3>语音输入</h3>{toggle('voice','enabled','开启语音输入','麦克风录音在本机识别，识别文字确认后再发送模型。',<Mic size={18}/>)}{voice.enabled&&<label className="voice-language"><span>识别语言</span><Dropdown aria-label="语音识别语言" value={voice.language} disabled={!!busy} onChange={e=>update('voice','language',e.target.value)}><option value="auto">自动识别（短句优先中文）</option><option value="zh">中文</option><option value="en">英语</option></Dropdown></label>}<p className="field-hint">{state.speechStatus?.available===false?state.speechStatus.message:'本地语音引擎：Whisper。'}点击聊天工具栏的麦克风开始录音，最长 2 分钟；识别结果可编辑。</p></section></div>;
}
