import Dropdown from './Dropdown.jsx';
import React,{useState,useEffect,useRef} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {ArrowUp,Paperclip,Square,Image,Presentation,MessageSquare,ChevronDown,X,Download,AlertCircle,Users,PanelRight,MoreHorizontal,FileText,LoaderCircle,Sparkles,Settings2,UserRound,Plus,History,Terminal} from 'lucide-react';
import {Avatar,UserAvatar,IconButton,CopyButton,AssetTile,ModelSelect,formatTime,providerName} from './Common.jsx';
import PresentationDialog from './PresentationDialog.jsx';
import {detectPresentationIntent} from '../../core/presentations.mjs';
import VoiceInput from './VoiceInput.jsx';
import TaskActivity from './TaskActivity.jsx';

function Message({message,agents,assets,profile,onSave,onOpen}){
 const agent=agents.find(a=>a.id===message.agentId);
 const files=(message.attachments||[]).map(item=>typeof item==='string'?assets.find(a=>a.id===item):item).filter(Boolean);
 const markdown={pre:({children})=><div className="code-block"><pre>{children}</pre></div>,a:({children,...props})=><a {...props} target="_blank" rel="noreferrer">{children}</a>};
 return <article className={`message message-${message.role} ${message.status==='error'?'message-error':''}`}>
  {message.role==='assistant'&&<Avatar agent={agent} size="small"/>}
  <div className="message-body">
   <div className="message-meta"><strong>{message.role==='user'?profile?.displayName||'你':message.role==='system'?'系统':agent?.name||'AI'}</strong>{message.model&&<span title={message.model}>{message.model}</span>}<time>{formatTime(message.createdAt)}</time></div>
   <div className="message-content">
    {message.content&&<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdown}>{message.content}</ReactMarkdown>}
    {message.status==='streaming'&&!message.content&&<div className="thinking"><span/><span/><span/><small>正在思考</small></div>}
    {files.length>0&&<div className="message-assets">{files.map(asset=>asset.type==='image'&&asset.url?<figure key={asset.id} className="message-image"><button className="image-open-button" onClick={()=>onOpen?.(asset)} aria-label={`打开 ${asset.name}`}><img src={asset.url} alt={asset.name}/></button><figcaption><span>{asset.name}</span><IconButton title="保存图片" onClick={()=>onSave(asset.id)}><Download size={15}/></IconButton></figcaption></figure>:<AssetTile key={asset.id} asset={asset} onSave={onSave} onOpen={onOpen}/>)}</div>}
    {message.status==='error'&&<div className="inline-error"><AlertCircle size={15}/><span>{message.error||'本次请求未完成，请检查密钥、额度与网络后重试。'}</span></div>}
    {message.status==='cancelled'&&<p className="cancelled-label">{message.kind==='image'?'已停止等待；平台已提交的图像任务可能继续运行并计费。':'已停止生成'}</p>}
   </div>
   {message.content&&message.status!=='streaming'&&<div className="message-actions"><CopyButton text={message.content}/></div>}
  </div>{message.role==='user'&&<UserAvatar profile={profile} className="user-message-avatar"/>}
 </article>;
}

export default function Conversation({chat,state,onSend,onStop,onImport,onDrop,onSave,onOpenAsset,onModel,onManage,onTogglePanel,onSettings,onExport,onRename,onDelete,onNewChat,onSwitchChat,onTranscribe,onCancelTranscribe,revisionDraft,harnessMode=false}){
 const [text,setText]=useState(''),[pending,setPending]=useState([]),[mode,setMode]=useState(harnessMode?'task':'chat'),[rounds,setRounds]=useState(1),[targets,setTargets]=useState([]),[imageProvider,setImageProvider]=useState('apimart'),[imageModel,setImageModel]=useState(''),[busy,setBusy]=useState(false),[drop,setDrop]=useState(false),[menu,setMenu]=useState(false);
 const [presentationDialog,setPresentationDialog]=useState(false);
 const [history,setHistory]=useState(false),[historyQuery,setHistoryQuery]=useState('');
 const scroll=useRef(null),end=useRef(null),input=useRef(null),autoScroll=useRef(true),lastChat=useRef(null);
 const members=state.agents.filter(a=>chat.agentIds.includes(a.id));
 const single=members[0],group=chat.type==='group',images=state.models.filter(m=>m.kind==='image'&&m.provider===imageProvider);
 const histories=state.chats.filter(c=>c.entryPoint===chat.entryPoint&&c.type===chat.type&&c.agentIds.length===chat.agentIds.length&&c.agentIds.every(id=>chat.agentIds.includes(id))&&(!historyQuery||[c.title,...c.messages.map(m=>m.content)].join(' ').toLowerCase().includes(historyQuery.toLowerCase()))).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
 useEffect(()=>{if(lastChat.current!==chat.id){setText('');setPending([]);setTargets([]);setMenu(false);autoScroll.current=true;lastChat.current=chat.id;}},[chat.id]);
 useEffect(()=>{if(revisionDraft?.chatId!==chat.id)return;setText(previous=>[previous,revisionDraft.text].filter(Boolean).join('\n\n'));const asset=state.assets.find(a=>a.id===revisionDraft.assetId);if(asset)setPending(p=>[...p.filter(a=>a.id!==asset.id),asset]);setMode('task');input.current?.focus();},[revisionDraft?.id]);
 useEffect(()=>{if(chat.running&&chat.messages.some(m=>m.kind==='image'&&m.status==='streaming'))setMode('image');},[chat.running,chat.messages]);
 useEffect(()=>{if(chat.running&&chat.run?.mode==='task')setMode('task');},[chat.running,chat.run]);
 useEffect(()=>{if(!images.some(m=>m.id===imageModel))setImageModel(images[0]?.id||'');},[imageProvider,state.models]);
 useEffect(()=>{if(autoScroll.current)end.current?.scrollIntoView({behavior:'instant',block:'end'});},[chat.messages]);
 const attach=async()=>{setBusy(true);try{const files=await onImport();setPending(p=>[...new Map([...p,...files].map(f=>[f.id,f])).values()].slice(0,8));}finally{setBusy(false);}};
 const latestPresentation=chat.messages.flatMap(m=>m.attachments||[]).map(a=>typeof a==='string'?state.assets.find(f=>f.id===a):a).filter(a=>a?.presentation).at(-1);
 const presentationIntent=detectPresentationIntent(text,{hasPresentation:!!latestPresentation});
 const modifyingPresentation=presentationIntent.action==='revise';
 const send=async e=>{e?.preventDefault();if((!text.trim()&&!pending.length)||chat.running||busy)return;if(mode==='chat'&&presentationIntent.isPresentation){setPresentationDialog(true);return;}setBusy(true);try{await onSend({chatId:chat.id,text:text.trim(),attachmentIds:pending.map(a=>a.id),targets:targets.length?targets:undefined,mode:harnessMode?'task':mode,...(harnessMode?{harnessProfile:'sdk'}:{}),imageModel:mode==='image'?imageModel:undefined,imageProvider:mode==='image'?imageProvider:undefined,rounds:group?rounds:1});setText('');setPending([]);autoScroll.current=true;input.current?.focus();}catch{}finally{setBusy(false);}};
 const sendPresentation=async({brief,template,agentId})=>{await onSend({chatId:chat.id,text:brief,attachmentIds:pending.map(a=>a.id),mode:'presentation',presentationTemplate:template,presentationAgentId:agentId,...(modifyingPresentation?{presentationId:latestPresentation.id}:{})});setText('');setPending([]);autoScroll.current=true;};
 const handleDrop=async e=>{e.preventDefault();setDrop(false);if(!e.dataTransfer.files.length)return;setBusy(true);try{const files=await onDrop([...e.dataTransfer.files]);setPending(p=>[...p,...files].slice(0,8));}finally{setBusy(false);}};
 const selectedProviders=mode==='image'?[imageProvider]:[...new Set(members.filter(a=>!targets.length||targets.includes(a.id)).map(a=>a.provider))];
 const missing=selectedProviders.filter(p=>!state.providers[p]?.configured);
 return <section className={`conversation ${drop?'drop-active':''}`} onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDrop(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDrop(false);}} onDrop={handleDrop}>
  <header className="chat-header"><div className="chat-heading"><h1>{chat.title}{group&&<small>（{members.length}）</small>}</h1></div>
   <div className="chat-header-actions"><IconButton title="新开对话" onClick={onNewChat}><Plus size={19}/></IconButton><div className="menu-anchor"><IconButton title="历史会话" onClick={()=>setHistory(!history)}><History size={18}/></IconButton>{history&&<><button className="menu-away" aria-label="关闭历史会话" onClick={()=>setHistory(false)}/><div className="history-popover"><header><strong>历史会话</strong><span>{histories.length}</span></header><input autoFocus aria-label="搜索历史会话" placeholder="搜索此助手的会话" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/><div>{histories.length?histories.map(item=><button key={item.id} className={item.id===chat.id?'current':''} onClick={()=>{setHistory(false);onSwitchChat(item.id);}}><strong>{item.title}</strong><small>{item.messages.at(-1)?.content?.slice(0,60)||'暂无消息'}</small><time>{new Date(item.updatedAt).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></button>):<p>没有找到相关会话</p>}</div><footer>每个新对话使用独立的聊天上下文。</footer></div></>}</div><div className="menu-anchor"><IconButton title="会话操作" onClick={()=>setMenu(!menu)}><MoreHorizontal size={22}/></IconButton>{menu&&<><button className="menu-away" aria-label="关闭菜单" onClick={()=>setMenu(false)}/><div className="popover-menu"><button onClick={()=>{setMenu(false);onManage();}}>{group?'管理群成员':'助手设置'}</button><button onClick={()=>{setMenu(false);onTogglePanel();}}>查看成员与文件</button>{group&&<label className="menu-rounds">讨论轮数<Dropdown aria-label="讨论轮数" value={rounds} disabled={chat.running} onChange={e=>setRounds(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} 轮</option>)}</Dropdown></label>}<button onClick={()=>{setMenu(false);onRename();}}>重命名会话</button><button onClick={()=>{setMenu(false);onExport();}}>导出聊天记录</button><button className="danger" onClick={()=>{setMenu(false);onDelete();}}>删除会话</button></div></>}</div></div>
  </header>
  <div className="transcript" ref={scroll} onScroll={()=>{const el=scroll.current;autoScroll.current=el.scrollHeight-el.scrollTop-el.clientHeight<120;}}>
   {!chat.messages.length?<div className="conversation-empty"><p>暂无消息</p></div>:chat.messages.map(m=><Message key={m.id} message={m} agents={state.agents} assets={state.assets} profile={state.profile} onSave={onSave} onOpen={onOpenAsset}/>)}
   <TaskActivity chat={chat} state={state} onSave={onSave} onOpen={onOpenAsset}/>
   <div ref={end}/>
  </div>
  <div className="composer-wrap">
   {missing.length>0&&<button className="key-notice" onClick={onSettings}><KeyNoticeIcon/><span>配置 {missing.map(providerName).join('、')} 密钥后开始</span><span>前往设置 →</span></button>}
   <form className="composer" onSubmit={send}>
    {pending.length>0&&<div className="pending-assets">{pending.map(a=><AssetTile asset={a} key={a.id} compact onRemove={id=>setPending(p=>p.filter(a=>a.id!==id))}/>)}</div>}
    <div className="composer-toolbar"><div className="composer-tools"><IconButton title="上传文件" onClick={attach} disabled={busy||chat.running}><Paperclip size={20}/></IconButton>{!harnessMode&&<IconButton title={mode==='image'?'切回聊天':'作图'} className={mode==='image'?'active-mode':''} onClick={()=>setMode(mode==='image'?'chat':'image')} disabled={chat.running}><Image size={20}/></IconButton>}<IconButton title={mode==='task'?'切回聊天':'执行任务'} className={mode==='task'?'active-mode':''} onClick={()=>{if(!harnessMode)setMode(mode==='task'?'chat':'task');}} disabled={chat.running}><Terminal size={20}/></IconButton><VoiceInput enabled={state.profile?.voice?.enabled} disabled={busy||chat.running} onSettings={()=>onSettings('desktop')} transcribe={onTranscribe} onCancel={onCancelTranscribe} onText={value=>{setText(previous=>previous?previous+'\n'+value:value);input.current?.focus();}}/><IconButton title="制作演示文稿" onClick={()=>setPresentationDialog(true)} disabled={chat.running||busy}><Presentation size={20}/></IconButton>{group&&<Dropdown aria-label="回复成员" className="reply-target" disabled={chat.running} value={targets[0]||'all'} onChange={e=>setTargets(e.target.value==='all'?[]:[e.target.value])}><option value="all">@ 所有人</option>{members.map(a=><option value={a.id} key={a.id}>@ {a.name}</option>)}</Dropdown>}</div><div className="composer-mode-label">{mode==='image'?'图像创作':mode==='task'?'任务模式 · Harness':group&&rounds>1?`${rounds} 轮讨论`:''}</div></div>
    <textarea ref={input} aria-label="消息输入框" placeholder={mode==='image'?'描述你想生成的图片…':mode==='task'?'描述目标、输入文件和期望交付物…':''} rows={3} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
    {mode==='task'&&<div className="task-mode-note"><Terminal size={13}/><span>助手可在本机工作区处理文件和运行工具，执行过程会显示在对话中。</span></div>}
    {mode==='image'&&<div className="image-controls"><span><Image size={13}/>图像模型</span><Dropdown aria-label="作图平台" value={imageProvider} onChange={e=>setImageProvider(e.target.value)} disabled={chat.running}><option value="apimart">APImart</option><option value="volcano">火山引擎</option></Dropdown><Dropdown aria-label="作图模型" value={imageModel} onChange={e=>setImageModel(e.target.value)} disabled={chat.running}>{images.length?images.map(m=><option key={m.id} value={m.id}>{m.name||m.id}</option>):<option value="">暂无图像模型</option>}</Dropdown></div>}
    <div className="send-row"><span>{chat.running?(mode==='image'?'正在生成，可停止等待':mode==='task'?'任务执行中…':'正在输入…'):mode==='image'?'图片生成费用由所选平台收取':'Enter 发送 · Shift + Enter 换行'}</span><div className="composer-right">{!group&&single&&<ModelSelect agent={single} models={state.models} disabled={chat.running} onChange={model=>onModel(single.id,model)}/>} {chat.running?<button type="button" className="send-text-button" onClick={()=>onStop(chat.id)} aria-label={mode==='image'?'停止等待':'停止生成'}>{mode==='image'?'停止等待':'停止'}</button>:<button type="submit" className="send-text-button" disabled={busy||(!text.trim()&&!pending.length)||missing.length>0||(mode==='image'&&!imageModel)} aria-label="发送消息">{busy?'发送中…':mode==='task'?'执行任务':'发送'}</button>}</div></div>
   </form>
  </div>{presentationDialog&&<PresentationDialog templates={state.presentationTemplates} members={members} text={text} modifying={modifyingPresentation} defaultTemplate={modifyingPresentation?latestPresentation?.presentation?.deck?.templateId:undefined} defaultAgentId={modifyingPresentation?latestPresentation?.presentation?.agentId:undefined} onClose={()=>setPresentationDialog(false)} onSend={sendPresentation}/>}
  {drop&&<div className="drop-overlay"><Paperclip size={38}/><h3>松开以添加文件</h3><p>每个文件最多 20 MB，一次最多 8 个</p></div>}
 </section>;
}
function KeyNoticeIcon(){return <AlertCircle size={15}/>;}
