import React from 'react';
import {Avatar,formatTime} from './Common.jsx';
import {conversationEntries} from '../../core/conversation-navigation.mjs';
export default function ConversationEntries({state,active,selected,query,onSelect,onDirect}){
 const rows=conversationEntries(state,{activeId:active,selected,query});
 return rows.length?rows.map(row=><button key={row.key} className={`chat-list-item ${row.chat?.id===active?'active':''}`} onClick={()=>row.chat?onSelect(row.chat):onDirect(row.agent)}>
  <Avatar agent={row.agent} group={row.group}/><span className="chat-list-text"><span><strong>{row.title}</strong><time>{formatTime(row.chat?.updatedAt)}</time></span><small>{row.running?'正在处理…':row.last?.status==='error'?'请求未完成':row.last?.content?.slice(0,70)||(row.last?.attachments?.length?'[文件]':'开始聊天')}</small></span>{row.running&&<span className="running-dot"/>}
 </button>):<div className="sidebar-empty">没有找到相关伙伴或群聊</div>;
}
