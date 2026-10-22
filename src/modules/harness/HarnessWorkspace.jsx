import React,{useState} from 'react';
import {Terminal,Plus} from 'lucide-react';
import RightPanel from '../../components/RightPanel.jsx';
import {Avatar,IconButton} from '../../components/Common.jsx';
import Conversation from '../../components/Conversation.jsx';
import './harness.css';

/** 会话、审批、文件和模型组件承载 SDK 的执行过程。 */
export default function HarnessWorkspace({state,call,chatId,onSelect,onOpen,onSave,onModel,onSettings,onManage,onRename,onDelete}){
 const [members,setMembers]=useState([state.agents[0]?.id].filter(Boolean)),[creating,setCreating]=useState(false),[filesOpen,setFilesOpen]=useState(false),[error,setError]=useState('');
 const chats=state.chats.filter(c=>c.entryPoint==='harness').sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)),chat=chats.find(c=>c.id===chatId)||chats[0];
 const create=async()=>{if(!members.length)return;setError('');try{const c=await call('createChat',{agentIds:members,entryPoint:'harness',title:members.map(id=>state.agents.find(a=>a.id===id)?.name).join('、')+' · 开发任务'});await call('bootstrap');onSelect(c.id);setCreating(false);}catch(e){setError(e.message);}};
 const upload=async()=>await call('importFiles',{chatId:chat.id})||[];
 const drop=async files=>{if(files.length>8||files.some(f=>f.size>20*1024*1024))throw Error('一次最多8个文件，每个不超过20 MB');const rows=await Promise.all(files.map(f=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:f.name,base64:String(reader.result).split(',')[1]});reader.onerror=reject;reader.readAsDataURL(f);})));return call('importFileData',{files:rows,chatId:chat.id});};
 return <section className="harness-workspace" aria-label="开发执行工作区"><aside className="harness-sessions"><header><Terminal size={17}/><strong>开发任务</strong><IconButton title="选择助手新建任务" onClick={()=>setCreating(v=>!v)}><Plus size={17}/></IconButton></header>
  <div className="harness-session-list">{chats.map(c=><button key={c.id} className={c.id===chat?.id?'current':''} onClick={()=>{onSelect(c.id);setCreating(false);}}><strong>{c.title}</strong><small>{c.running?'正在执行':c.messages.at(-1)?.content?.slice(0,44)||'等待任务要求'}</small></button>)}</div>
  </aside>
  <div className="harness-main">{(!chat||creating)&&<section className="harness-new"><h2>让助手完成一个开发任务</h2><p>选择一位助手，或选择多位分工处理。模型沿用各自设置。</p><div className="harness-agent-picker">{state.agents.map(a=><button key={a.id} aria-pressed={members.includes(a.id)} onClick={()=>setMembers(v=>v.includes(a.id)?v.filter(id=>id!==a.id):[...v,a.id])}><Avatar agent={a}/><span>{a.name}</span></button>)}</div><div className="harness-create-actions"><button className="button primary" disabled={!members.length} onClick={create}><Plus size={15}/>创建任务</button>{chat&&<button className="text-button" onClick={()=>setCreating(false)}>返回当前任务</button>}</div>{error&&<p role="alert">{error}</p>}</section>}
   {chat&&!creating&&<Conversation key={chat.id} harnessMode chat={chat} state={state} onNewChat={()=>setCreating(true)} onSwitchChat={onSelect} onSend={p=>call('sendMessage',p)} onStop={id=>call('stopChat',{chatId:id})} onImport={upload} onDrop={drop} onSave={onSave} onOpenAsset={onOpen} onModel={onModel} onSettings={onSettings} onManage={()=>onManage(chat)} onRename={()=>onRename(chat)} onDelete={()=>onDelete(chat)} onExport={()=>call('exportChat',{chatId:chat.id})} onTogglePanel={()=>setFilesOpen(v=>!v)} onTranscribe={p=>call('transcribeAudio',p)} onCancelTranscribe={()=>call('cancelTranscription')}/>}
  </div>
  {filesOpen&&chat&&<RightPanel chat={chat} state={state} onOpenAsset={onOpen} onClose={()=>setFilesOpen(false)} onModel={onModel} onSave={onSave} onManage={()=>onManage(chat)}/>}
 </section>;
}
