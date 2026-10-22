import React from 'react';
import {Users,FolderOpen,FileText,ChevronRight,X,Plus,Download} from 'lucide-react';
import {Avatar,IconButton,AssetTile,ModelSelect,providerName} from './Common.jsx';
export default function RightPanel({chat,state,onClose,onModel,onSave,onOpenAsset,onManage}){
 const members=state.agents.filter(a=>chat.agentIds.includes(a.id));
 const ids=[...new Set(chat.messages.flatMap(m=>(m.attachments||[]).map(a=>typeof a==='string'?a:a.id)))];
 const files=state.assets.filter(a=>ids.includes(a.id));
 return <aside className="detail-panel"><header><h2>会话详情</h2><IconButton title="收起详情" onClick={onClose}><X size={16}/></IconButton></header>
  <section><div className="detail-title"><span><Users size={15}/>{chat.type==='group'?'群成员':'当前 Agent'}</span><button className="text-button" onClick={onManage}>管理<ChevronRight size={12}/></button></div>
   <div className="member-details">{members.map(a=><div className="member-detail" key={a.id}><div><Avatar agent={a} size="small"/><strong>{a.name}</strong><span>{providerName(a.provider)}</span></div><ModelSelect agent={a} models={state.models} disabled={chat.running} onChange={model=>onModel(a.id,model)} label={`${a.name} 的模型版本`}/></div>)}</div>
  </section><section className="files-section"><div className="detail-title"><span><FolderOpen size={15}/>会话文件</span><small>{files.length}</small></div>
   {files.length?<div className="detail-files">{files.map(a=><AssetTile key={a.id} asset={a} onSave={onSave} onOpen={onOpenAsset} compact/>)}</div>:<div className="detail-empty"><FileText size={27} strokeWidth={1.3}/><p>上传的文件与生成的图片<br/>会保存在这里</p></div>}
  </section><div className="detail-footnote">聊天与文件保存在这台电脑。<br/>发送消息时，相关内容会交给所选模型平台处理。</div>
 </aside>;
}
