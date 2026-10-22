import {useMemo,useRef,useState} from 'react';
import {collectPresentations,presentationPayload,revisionContext} from './presentation-items.mjs';

export default function usePresentationWorkspace({state,call,onChat}){
 const items=useMemo(()=>collectPresentations(state),[state]);
 const [selectedId,setSelectedId]=useState(null),[dialog,setDialog]=useState(null),[preparedChatId,setPreparedChatId]=useState(null);
 const prepared=useRef(null),latest=useRef(state);latest.current=state;
 const selected=items.find(item=>item.id===selectedId)||items[0]||null;
 const start=asset=>{prepared.current=null;setPreparedChatId(null);setDialog(asset?{kind:'revise',asset}:{kind:'new'});};
 const close=()=>setDialog(null);
 const source=dialog?.asset?revisionContext(state,dialog.asset):null;
 const preparedChat=state.chats.find(chat=>chat.id===preparedChatId);
 const members=preparedChat?state.agents.filter(agent=>preparedChat.agentIds.includes(agent.id)):source?.members||state.agents;
 const submit=async({brief,template,agentId})=>{
  const snapshot=latest.current,agent=snapshot.agents.find(item=>item.id===agentId);
  if(!agent)throw new Error('请选择一位可用的助手。');
  if(!snapshot.providers[agent.provider]?.configured)throw new Error(`请先在模型与密钥设置中配置${agent.provider==='volcano'?'火山引擎':'APImart'}。`);
  const original=dialog?.asset?revisionContext(snapshot,dialog.asset).chat:null;
  let chat=original||prepared.current;
  if(chat?.running)throw new Error('原会话正在处理任务，请等待完成后再修改。');
  if(chat&&!chat.agentIds.includes(agentId))throw new Error('请选择原会话里的助手。');
  if(!chat){chat=await call('createChat',{agentIds:[agentId],title:`PPT · ${brief.trim().replace(/\s+/g,' ').slice(0,36)}`});prepared.current=chat;setPreparedChatId(chat.id);}
  await call('sendMessage',presentationPayload({chatId:chat.id,brief,template,agentId,asset:dialog?.asset}));
  setDialog(null);prepared.current=null;setPreparedChatId(null);onChat(chat.id);
 };
 return {items,selected,select:setSelectedId,startNew:()=>start(null),revise:start,dialog,dialogProps:dialog?{onImportTemplate:async()=>{const template=await call('importPresentationTemplate');if(template)await call('bootstrap');return template;},templates:state.presentationTemplates,members,modifying:dialog.kind==='revise',defaultTemplate:source?.templateId,defaultAgentId:source?.agentId,onClose:close,onSend:submit}:null};
}
