export const isPresentationAsset=asset=>!!asset?.presentation||/\.(pptx?|odp)$/i.test(asset?.name||'');
export const presentationTitle=asset=>asset?.presentation?.deck?.title||String(asset?.name||'演示文稿').replace(/\.(pptx?|odp)$/i,'');
export function collectPresentations(state){
 const assets=new Map((state.assets||[]).filter(isPresentationAsset).map(asset=>[asset.id,asset]));
 for(const chat of state.chats||[])for(const message of chat.messages||[])for(const asset of message.attachments||[]){if(typeof asset==='object'&&isPresentationAsset(asset)&&!assets.has(asset.id))assets.set(asset.id,asset);}
 const rows=[...assets.values()].map(asset=>({id:`asset:${asset.id}`,kind:'asset',asset,title:presentationTitle(asset),chatId:asset.presentation?.chatId,agentId:asset.presentation?.agentId,status:'ready',createdAt:asset.updatedAt||asset.createdAt,previousId:asset.presentation?.previousId}));
 for(const chat of state.chats||[]){
  const messages=chat.messages||[];
  for(let index=0;index<messages.length;index++){
   const message=messages[index];if(message.kind!=='presentation'||message.role!=='assistant')continue;
   if((message.attachments||[]).some(asset=>assets.has(typeof asset==='string'?asset:asset?.id)))continue;
   if(message.status==='complete')continue;
   const request=messages.slice(0,index).findLast(item=>item.role==='user');
   rows.push({id:`message:${message.id}`,kind:'run',chatId:chat.id,agentId:message.agentId,title:request?.content?.slice(0,48)||chat.title||'演示文稿',status:message.status==='streaming'?(chat.running?'generating':'cancelled'):message.status==='error'?'error':'cancelled',content:message.content,error:message.error,createdAt:message.createdAt});
  }
 }
 return rows.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
}
export function revisionContext(state,asset){
 if(!asset?.presentation)throw new Error('请选择此应用生成的演示文稿。');
 const chat=state.chats.find(item=>item.id===asset.presentation.chatId)||null;
 const members=chat?state.agents.filter(agent=>chat.agentIds.includes(agent.id)):state.agents;
 const preferred=members.find(agent=>agent.id===asset.presentation.agentId)||members.find(agent=>agent.id==='claude')||members[0];
 return {chat,members,agentId:preferred?.id,templateId:asset.presentation.sourceTemplateId||asset.presentation.deck?.templateId,presentationId:asset.id};
}
export function presentationPayload({chatId,brief,template,agentId,asset}){
 return {chatId,text:brief.trim(),mode:'presentation',presentationTemplate:template,presentationAgentId:agentId,...(asset?{presentationId:asset.id}:{})};
}
