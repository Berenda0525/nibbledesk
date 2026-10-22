/** 联系人入口与上下文会话分开；历史记录保持原样。 */
export function conversationEntries(state,{activeId,selected={},query=''}={}){
 const sorted=state.chats.filter(c=>c.entryPoint!=='harness').sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
 const text=query.trim().toLowerCase();
 const matches=(agent,chats)=>!text||[agent.name,agent.model,...chats.flatMap(c=>[c.title,...(c.messages||[]).map(m=>m.content)])].join(' ').toLowerCase().includes(text);
 const entries=state.agents.flatMap(agent=>{
  const chats=sorted.filter(c=>c.type==='direct'&&c.agentIds.length===1&&c.agentIds[0]===agent.id);
  if(!matches(agent,chats))return [];
  const chat=chats.find(c=>c.id===activeId)||chats.find(c=>c.id===selected[agent.id])||chats[0];
  return [{key:agent.id,title:agent.name,agent,chat,running:chats.some(c=>c.running),last:chat?.messages?.at(-1)}];
 });
 return [...entries,...sorted.filter(c=>c.type==='group'&&(!text||[c.title,...(c.messages||[]).map(m=>m.content)].join(' ').toLowerCase().includes(text))).map(chat=>({key:chat.id,title:chat.title,chat,group:true,agent:state.agents.find(a=>a.id===chat.agentIds[0]),last:chat.messages?.at(-1),running:chat.running}))];
}
