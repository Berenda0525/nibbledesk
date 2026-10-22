const ENTRY='island';
const preview=value=>{const text=String(value??'');return text.length>24000?text.slice(0,24000)+'\n\n…在瓜瓜中继续查看完整内容':text;};
const owns=(chat,agentId)=>chat?.entryPoint===ENTRY&&chat.type==='direct'&&chat.agentIds?.length===1&&chat.agentIds[0]===agentId;

export function createIslandChatController({service,onSnapshot=()=>{}}){
  const selected=new Map(),snapshots=new Map(),pending=new Set();
  const agentFor=(state,id)=>{const agent=state.agents.find(item=>item.id===id);if(!agent)throw new Error('请选择有效助手');return agent;};
  function chatFor(state,agentId,chatId){
    if(chatId){const chat=state.chats.find(item=>item.id===chatId);if(!owns(chat,agentId))throw new Error('这段对话不属于当前助手的刘海会话');return chat;}
    const current=state.chats.find(item=>item.id===selected.get(agentId));
    return owns(current,agentId)?current:state.chats.find(item=>owns(item,agentId));
  }
  function snapshot(state,agentId,chat){
    const agent=agentFor(state,agentId);
    const messages=(chat?.messages??[]).slice(-16).map(message=>({id:message.id,role:message.role==='user'?'user':'assistant',attachments:(message.attachments||[]).map(a=>typeof a==='string'?state.assets.find(v=>v.id===a):a).filter(Boolean).slice(0,8).map(a=>({id:a.id,name:a.name})),content:preview(message.content),status:message.status,error:message.error?String(message.error).slice(0,1000):undefined}));
    const latest=messages.at(-1);
    return {models:state.models.filter(m=>m.provider===agent.provider&&m.kind==='chat').slice(0,100).map(m=>({id:m.id,name:m.name||m.id})),voiceEnabled:state.profile?.voice?.enabled===true,agentId,chatId:chat?.id??null,messages,running:!!chat?.running,model:agent.model,error:latest?.role==='assistant'&&latest.error?latest.error:undefined};
  }
  function publish(value){
    const previous=snapshots.get(value.agentId);snapshots.set(value.agentId,value);
    if(JSON.stringify(previous)!==JSON.stringify(value))onSnapshot(structuredClone(value));
    return structuredClone(value);
  }
  async function read({agentId,chatId}={}){
    const state=await service.getState();agentFor(state,agentId);
    const chat=chatFor(state,agentId,chatId);if(chat)selected.set(agentId,chat.id);
    return publish(snapshot(state,agentId,chat));
  }
  async function create(state,agentId){
    const agent=agentFor(state,agentId);
    const chat=await service.call('createChat',{agentIds:[agentId],title:agent.name,entryPoint:ENTRY,reuseEmpty:true});
    selected.set(agentId,chat.id);return chat;
  }
  async function send({agentId,chatId,text,attachmentIds=[]}={}){
    if(!Array.isArray(attachmentIds)||attachmentIds.length>8||attachmentIds.some(id=>typeof id!=='string'))throw new Error('附件参数无效');
    if(typeof text!=='string'||(!text.trim()&&!attachmentIds.length)||text.length>12000)throw new Error('请输入文字或添加文件');
    if(pending.has(agentId))throw new Error('这位助手正在发送消息，请稍候');
    pending.add(agentId);
    try{
      const state=await service.getState();const agent=agentFor(state,agentId);
      if(attachmentIds.some(id=>!state.assets.some(a=>a.id===id&&a.scope===`agents/${agentId}`)))throw new Error('附件不属于当前伙伴，请重新拖入');
      if(!state.providers?.[agent.provider]?.configured)throw new Error(`请先在瓜瓜设置中填写 ${agent.provider==='volcano'?'火山方舟':'APImart'} API Key`);
      let chat=chatFor(state,agentId,chatId);if(chat?.running)throw new Error('这段对话正在回复，请先停止或等待完成');
      chat??=await create(state,agentId);selected.set(agentId,chat.id);
      await service.call('sendMessage',{chatId:chat.id,text:text.trim(),attachmentIds,mode:'chat',targets:[agentId],rounds:1});
      return read({agentId,chatId:chat.id});
    }finally{pending.delete(agentId);}
  }
  async function stop({agentId,chatId}={}){
    const state=await service.getState();agentFor(state,agentId);
    const chat=chatFor(state,agentId,chatId);if(!chat)return read({agentId});
    await service.call('stopChat',{chatId:chat.id});return read({agentId,chatId:chat.id});
  }
  async function newChat({agentId}={}){
    if(pending.has(agentId))throw new Error('请先等待当前消息发出');
    pending.add(agentId);
    try{
      const state=await service.getState();agentFor(state,agentId);
      if(chatFor(state,agentId)?.running)throw new Error('请先停止当前回复，再新开对话');
      const chat=await create(state,agentId);return read({agentId,chatId:chat.id});
    }finally{pending.delete(agentId);}
  }
  function handleEvent(event){
    if(event.type==='state'){
      const state=event.state;
      for(const agent of state.agents){const chat=chatFor(state,agent.id);if(chat||snapshots.has(agent.id)){if(chat)selected.set(agent.id,chat.id);publish(snapshot(state,agent.id,chat));}}
    }else if(event.type==='delta'){
      const value=[...snapshots.values()].find(item=>item.chatId===event.chatId);if(!value)return;
      const message=value.messages.find(item=>item.id===event.messageId);if(!message)return;
      const content=preview(event.text);if(message.content===content)return;
      // 单条回复已确认变化，只替换该消息；边界处的深拷贝隔离接收方修改。
      const next={...value,messages:value.messages.map(item=>item===message?{...item,content}:item)};
      snapshots.set(next.agentId,next);onSnapshot(structuredClone(next));
    }
  }
  async function setModel({agentId,model}={}){const state=await service.getState();const a=agentFor(state,agentId);if(chatFor(state,agentId)?.running)throw new Error('请先等待当前回复结束');await service.call('updateAgent',{id:agentId,provider:a.provider,model});return read({agentId});}
  return {read,send,stop,newChat,setModel,handleEvent};
}
