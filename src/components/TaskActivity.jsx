import React,{useState} from 'react';
import {ChevronDown,ChevronRight,Terminal,Check,LoaderCircle,AlertCircle,FileCode2,Wrench} from 'lucide-react';
import {AssetTile} from './Common.jsx';

export default function TaskActivity({chat,state,onSave,onOpen}){
 const [expanded,setExpanded]=useState(true);
 const events=[...new Map([...(chat.taskEvents||[]),...chat.messages.flatMap(m=>m.taskEvents||[])].map((e,i)=>[e.id||`${i}:${e.text}`,e])).values()];
 const run=chat.run,active=chat.running&&run?.mode==='task';
 if(!events.length&&run?.mode!=='task')return null;
 const label=active?'正在执行任务':run?.status==='error'?'任务遇到问题':run?.status==='cancelled'?'任务已停止':'任务执行记录';
 const files=events.map(e=>e.assetId?state.assets.find(a=>a.id===e.assetId):null).filter(Boolean);
 return <section className="task-activity" aria-label="任务执行记录"><button className="task-activity-heading" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{active?<LoaderCircle className="spin" size={15}/>:<Terminal size={15}/>}<strong>{label}</strong><span>Harness</span>{expanded?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>{expanded&&<div className="task-events">{events.length?events.map((event,i)=><div className={`task-event task-event-${event.status||event.type}`} key={event.id||i}>{event.status==='error'||event.type==='error'?<AlertCircle size={13}/>:event.status==='running'?<LoaderCircle size={13} className="spin"/>:event.status==='completed'||event.status==='success'?<Check size={13}/>:event.type==='file'?<FileCode2 size={13}/>:<Wrench size={13}/>}<div><span>{state.agents.find(a=>a.id===event.agentId)?.name}{event.tool&&<code>{event.tool}</code>}</span><p>{event.text||event.tool||'任务状态更新'}</p></div></div>):<p className="task-awaiting">任务已提交，等待执行事件。</p>}{files.length>0&&<div className="task-deliveries">{files.map(file=><AssetTile key={file.id} asset={file} onSave={onSave} onOpen={onOpen} compact/>)}</div>}</div>}</section>;
}
