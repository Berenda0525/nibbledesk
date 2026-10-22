import Dropdown from './Dropdown.jsx';
import React,{useEffect,useRef} from 'react';
import {X,Users,UserRound,FileText,Download,Check,Copy} from 'lucide-react';
import claudeIcon from '../assets/agents/claude.svg';
import gptIcon from '../assets/agents/gpt.svg';
import geminiIcon from '../assets/agents/gemini.png';
import deepseekIcon from '../assets/agents/deepseek.svg';
import kimiIcon from '../assets/agents/kimi.svg';
import kimiLightIcon from '../assets/agents/kimi-light.svg';
const doubaoIcon = `${import.meta.env.BASE_URL}assets/agents/doubao-user.png`;
const agentImages={claude:claudeIcon,gpt:gptIcon,gemini:geminiIcon,deepseek:deepseekIcon,kimi:kimiIcon,doubao:doubaoIcon};
export const providerName=(p,providers)=>providers?.[p]?.name||({volcano:'火山引擎',apimart:'APImart',deepseek:'DeepSeek 官方'}[p]||p);
export const formatTime=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});};
export const formatSize=n=>n>1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
export function Avatar({agent,size='normal',group=false}){
 const letters={claude:'C',gpt:'G',gemini:'✦',deepseek:'D',kimi:'K',doubao:'豆'};
 const colors={claude:'#ba7357',gpt:'#3f6860',gemini:'#6382bd',deepseek:'#4976d5',kimi:'#303234',doubao:'#e59156'};
 const family=String(agent?.avatarKey||agent?.id||agent?.name||'').toLowerCase();
 const icon=agentImages[family];
 return <span className={`avatar avatar-${size} avatar-${family} ${group?'group-avatar':''} ${icon&&!group?'image-avatar':''}`} style={{'--avatar-color':colors[family]||agent?.color||'#6d7785'}}>{group?<Users size={size==='small'?16:21}/>:family==='kimi'?<><img className="logo-dark" src={icon} alt=""/><img className="logo-light" src={kimiLightIcon} alt=""/></>:icon?<img src={icon} alt=""/>:letters[family]||(agent?.name||'A').slice(0,1).toUpperCase()}</span>;
}
export function IconButton({title,children,className='',...props}){return <button type="button" aria-label={title} title={title} className={`icon-button ${className}`} {...props}>{children}</button>;}
export function UserAvatar({profile={},className=''}){return <span className={`personal-avatar ${className}`}>{profile.avatarUrl?<img src={profile.avatarUrl} alt={profile.displayName||'我的头像'}/>:<UserRound size={23}/>}</span>;}
export function Modal({title,children,onClose,wide=false,footer}){
 const ref=useRef(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
  <header className="modal-header"><h2>{title}</h2><IconButton title="关闭" onClick={onClose}><X size={20}/></IconButton></header><div className="modal-body">{children}</div>{footer&&<footer className="modal-footer">{footer}</footer>}
 </dialog>;
}
export function AssetTile({asset,onSave,onOpen,onRemove,compact=false}){
 if(!asset)return null;
 return <div className={`asset-tile ${compact?'compact':''}`}>
 {asset.type==='image'&&asset.url?<img src={asset.url} alt={asset.name} loading="lazy"/>:<span className="file-symbol"><FileText size={22}/></span>}
 {onOpen?<button className="asset-label asset-open" onClick={()=>onOpen(asset)} aria-label={`打开 ${asset.name}`}><strong title={asset.name}>{asset.name}</strong><small>{formatSize(asset.size||0)}{asset.warning?' · '+asset.warning:''}</small></button>:<div className="asset-label"><strong title={asset.name}>{asset.name}</strong><small>{formatSize(asset.size||0)}{asset.warning?' · '+asset.warning:''}</small></div>}
 {onSave&&<IconButton title={'另存为 '+asset.name} onClick={()=>onSave(asset.id)}><Download size={16}/></IconButton>}
 {onRemove&&<IconButton title={'移除 '+asset.name} onClick={()=>onRemove(asset.id)}><X size={14}/></IconButton>}
 </div>;
}
export function CopyButton({text,title='复制'}){
 const [copied,setCopied]=React.useState(false),[failed,setFailed]=React.useState(false);
 const timeout=useRef();useEffect(()=>()=>clearTimeout(timeout.current),[]);
 return <button className="copy-button" title={failed?'复制失败，请选中文字复制':title} aria-label={copied?'已复制':title} onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setFailed(false);timeout.current=setTimeout(()=>setCopied(false),1600);}catch{setFailed(true);}}}>{copied?<Check size={14}/>:<Copy size={14}/>}<span>{failed?'请手动复制':copied?'已复制':title}</span></button>;
}
export function Empty({icon:Icon,title,children}){return <div className="empty"><span className="empty-symbol"><Icon size={28} strokeWidth={1.4}/></span><h3>{title}</h3><p>{children}</p></div>;}
export function ModelSelect({agent,models,onChange,disabled=false,label='对话模型'}){
 const list=models.filter(m=>m.kind==='chat'&&m.provider===agent.provider);
 const family=String(agent.id).toLowerCase();
 const own=list.filter(m=>String(m.family||m.id).toLowerCase().includes(family)||family==='doubao'&&/doubao|seed/i.test(m.id));
 const options=own.length?own:list;
 const present=options.some(m=>m.id===agent.model);
 return <Dropdown aria-label={label} value={agent.model||''} onChange={e=>onChange(e.target.value)} disabled={disabled} title={agent.model}>
 {!present&&<option value={agent.model||''}>{agent.model||'请选择模型'}</option>}{options.map(m=><option key={m.provider+':'+m.id} value={m.id}>{m.name||m.id}</option>)}
 </Dropdown>;
}
