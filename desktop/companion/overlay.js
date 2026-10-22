import {createIslandAttachments} from './file-drop.js';
import {audioToWav} from '../../shared/audio-wav.mjs';
import {createIslandMotion,islandFrame} from './motion.mjs';
'use strict';
const $=selector=>document.querySelector(selector);
const island=$('#island'),panel=$('#panel'),prompt=$('#prompt'),transcript=$('#transcript'),messages=$('#messages'),error=$('#error');
let surfaceWidth=432,surfaceHeight=466;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const motion=createIslandMotion({reducedMotion:motionPreference.matches,paint:progress=>{
  const frame=islandFrame(progress,surfaceWidth,surfaceHeight);
  island.style.clipPath=frame.clipPath;
  panel.style.opacity=String(frame.panelOpacity);panel.style.transform=frame.panelTransform;
  panel.style.visibility=frame.panelOpacity>0?'visible':'hidden';
  const compact=$('#compact');compact.style.opacity=String(frame.compactOpacity);compact.style.transform=frame.compactTransform;
}});
const updateMotionPreference=event=>motion.setReducedMotion(event.matches);
motionPreference.addEventListener('change',updateMotionPreference);
addEventListener('pagehide',()=>{motion.dispose();motionPreference.removeEventListener('change',updateMotionPreference);},{once:true});
const snapshots=new Map(),drafts=new Map(),pending=new Set();
const images={claude:'claude.svg',gpt:'gpt.svg',gemini:'gemini.png',deepseek:'deepseek.svg',kimi:'kimi.svg',doubao:'doubao.png'};
let music=null;
let agents=[],agentId='',expanded=false,notification=null,lastTyping=0,loadSequence=0;
const attachments=createIslandAttachments({root:island,getAgent:()=>agentId,onChange:()=>renderControls(),onError:showError});
const current=()=>snapshots.get(agentId)||{agentId,chatId:null,messages:[],running:false,model:agents.find(agent=>agent.id===agentId)?.model||'',error:''};
function showError(value=''){error.textContent=String(value);error.hidden=!value;}
function renderControls(){
  const chat=current(),busy=chat.running||pending.has(agentId);
  $('#send').hidden=chat.running;$('#send').disabled=busy||!agentId||(!prompt.value.trim()&&!attachments.get(agentId).length);
  $('#stop').hidden=!chat.running;$('#new-chat').disabled=busy||!agentId;
  $('#agent-name').textContent=agents.find(agent=>agent.id===agentId)?.name||'快聊';
  $('#model-label').textContent=(chat.model||'选择模型')+' ⌄';$('#voice').disabled=!chat.voiceEnabled;$('#voice').title=chat.voiceEnabled?'语音输入':'请先在瓜瓜设置开启语音输入';$('#model-label').title=chat.model||'';
  $('#thinking').hidden=!chat.running;$('#empty-state').hidden=chat.messages.length>0||chat.running;
  const anyRunning=[...snapshots.values()].some(snapshot=>snapshot.running);
  island.classList.toggle('running',anyRunning);island.classList.toggle('has-notification',!!notification);
  $('#compact-label').textContent=notification?`${notification.app} · 新消息`:anyRunning?'正在回复':music?.playing?(music.lyric||music.title||'音乐播放中'):'随时问我';
  for(const button of $('#agents').children){button.setAttribute('aria-selected',String(button.dataset.agent===agentId));button.classList.toggle('busy',snapshots.get(button.dataset.agent)?.running===true);}
}
function renderMessages(resetScroll=false){
  const chat=current(),atBottom=resetScroll||transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<42;
  const expected=new Set();
  for(const [index,message] of chat.messages.entries()){
    const key=`${message.id}:${index}`;expected.add(key);
    let item=[...messages.children].find(child=>child.dataset.key===key);
    if(!item){item=document.createElement('article');item.dataset.key=key;const content=document.createElement('div');content.className='message-content';item.appendChild(content);messages.appendChild(item);}
    item.className='message '+message.role;
    if(item.firstChild.textContent!==[message.content,...(message.attachments||[]).map(a=>'📎 '+a.name)].filter(Boolean).join('\n'))item.firstChild.textContent=[message.content,...(message.attachments||[]).map(a=>'📎 '+a.name)].filter(Boolean).join('\n');
  }
  for(const item of [...messages.children])if(!expected.has(item.dataset.key))item.remove();
  renderControls();showError(chat.error||'');
  if(atBottom)requestAnimationFrame(()=>{transcript.scrollTop=transcript.scrollHeight;});
}
function renderAgents(){
  const root=$('#agents');root.replaceChildren();
  for(const agent of agents){
    const button=document.createElement('button');button.type='button';button.className='agent-choice';button.dataset.agent=agent.id;button.setAttribute('role','tab');button.setAttribute('aria-label',agent.name);button.title=agent.name;
    const picture=document.createElement('span');picture.className='agent-picture';
    if(images[agent.avatarKey||agent.id]){const image=document.createElement('img');image.src='assets/'+images[agent.avatarKey||agent.id];image.alt='';picture.appendChild(image);}else picture.textContent=agent.name.slice(0,1);
    const label=document.createElement('span');label.className='agent-label';label.textContent=agent.name;
    button.append(picture,label);button.onclick=()=>selectAgent(agent.id);root.appendChild(button);
  }
  renderControls();
}
async function selectAgent(id){
  stopIslandRecording(true);
  if(!agents.some(agent=>agent.id===id))return;
  if(agentId)drafts.set(agentId,prompt.value);
  agentId=id;attachments.render();prompt.value=drafts.get(id)||'';renderMessages(true);
  const sequence=++loadSequence;
  try{const chat=await window.companion.call('chat-state',{agentId:id});snapshots.set(id,chat);if(sequence===loadSequence&&agentId===id)renderMessages(true);}
  catch(exception){if(sequence===loadSequence)showError(exception.message||'会话暂时无法读取');}
}
function applyExpanded(value){
  expanded=!!value;island.dataset.expanded=String(expanded);$('#compact').setAttribute('aria-expanded',String(expanded));
  motion.setExpanded(expanded);
  panel.inert=!expanded;panel.setAttribute('aria-hidden',String(!expanded));$('#compact').tabIndex=expanded?-1:0;
  if(!expanded){prompt.blur();stopIslandRecording(true);$('#model-menu').hidden=true;}
}
function render(state){
  if(Object.hasOwn(state,'music')){music=state.music;island.classList.toggle('music-playing',!!music?.playing);$('#music-strip').hidden=!music?.title;$('#music-title').textContent=music?.title||'';$('#music-lyric').textContent=music?.lyric||music?.artist||'';for(const root of document.querySelectorAll('.music-wave'))[...root.children].forEach((bar,i)=>bar.style.setProperty('--energy',String(music?.playing?music.bands?.[i]||0:0)));}
  if(state.geometry){surfaceWidth=state.geometry.surfaceWidth;surfaceHeight=state.geometry.surfaceHeight;document.documentElement.style.setProperty('--surface-width',surfaceWidth+'px');document.documentElement.style.setProperty('--surface-height',surfaceHeight+'px');motion.refresh();}
  if(typeof state.expanded==='boolean')applyExpanded(state.expanded);
  if(state.releaseFocus)prompt.blur();
  if(Array.isArray(state.agents)){
    agents=state.agents;const next=agents.some(agent=>agent.id===agentId)?agentId:state.selectedAgentId||agents[0]?.id||'';
    renderAgents();if(next!==agentId)selectAgent(next);
  }
  if(Array.isArray(state.chats))for(const chat of state.chats)snapshots.set(chat.agentId,chat);
  if(state.chat){snapshots.set(state.chat.agentId,state.chat);if(state.chat.agentId===agentId)renderMessages();}
  if(Object.hasOwn(state,'notification')){
    notification=state.notification;$('#notification').hidden=!notification;
    $('#notification-title').textContent=notification?`${notification.app} · ${notification.title}`:'';
    $('#notification-body').textContent=notification?.body||'';
  }
  renderControls();
}
window.companion.onState(render);
window.companion.call('status').then(render).catch(exception=>showError(exception.message));
$('#compact').onclick=()=>window.companion.call('expand').catch(exception=>showError(exception.message));
$('#collapse').onclick=()=>window.companion.call('collapse');
$('#open-workspace').onclick=()=>window.companion.call('open',{chatId:current().chatId}).catch(exception=>showError(exception.message));
$('#new-chat').onclick=async()=>{
  const id=agentId;if(!id||current().running||pending.has(id))return;pending.add(id);renderControls();
  try{const chat=await window.companion.call('quick-new',{agentId:id});snapshots.set(id,chat);if(agentId===id)renderMessages(true);}
  catch(exception){showError(exception.message||'暂时无法新建会话');}
  finally{pending.delete(id);renderControls();}
};
prompt.addEventListener('pointerdown',event=>{
  if(document.hasFocus()&&document.activeElement===prompt)return;
  event.preventDefault();window.companion.call('activate-input').then(()=>{prompt.focus();prompt.setSelectionRange(prompt.value.length,prompt.value.length);}).catch(exception=>showError(exception.message));
});
prompt.addEventListener('input',()=>{drafts.set(agentId,prompt.value);renderControls();if(Date.now()-lastTyping>200){lastTyping=Date.now();window.companion.call('typing').catch(()=>{});}});
prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('#composer').requestSubmit();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();window.companion.call('collapse');}});
$('#composer').addEventListener('submit',async event=>{
  event.preventDefault();const id=agentId,text=prompt.value.trim();if((!text&&!attachments.get(id).length)||!id||pending.has(id)||current().running)return;
  pending.add(id);showError('');renderControls();
  try{
    const chat=await window.companion.call('quick-send',{agentId:id,text,attachmentIds:attachments.get(id).map(a=>a.id)});attachments.clear(id);snapshots.set(id,chat);
    if((drafts.get(id)||'').trim()===text)drafts.set(id,'');
    if(agentId===id){if(prompt.value.trim()===text)prompt.value='';renderMessages(true);}
  }catch(exception){showError(exception.message||'发送失败，请重试');}
  finally{pending.delete(id);renderControls();}
});
$('#stop').onclick=async()=>{const id=agentId;$('#stop').disabled=true;try{await window.companion.call('quick-stop',{agentId:id});}catch(exception){showError(exception.message||'暂时无法停止');}finally{$('#stop').disabled=false;}};

let islandRecorder=null,islandStream=null,islandVoiceTimer=null,islandVoiceCancelled=false,islandRecognizing=false;
function stopIslandRecording(cancel=false){islandVoiceCancelled=cancel;clearTimeout(islandVoiceTimer);if(islandRecorder?.state==='recording')islandRecorder.stop();for(const t of islandStream?.getTracks()||[])t.stop();islandStream=null;if(cancel)window.companion.call('quick-voice-cancel').catch(()=>{});}
$('#model-label').onclick=async()=>{await window.companion.call('activate-input');const menu=$('#model-menu');menu.replaceChildren();for(const model of current().models||[]){const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(model.id===current().model));b.textContent=model.name;b.onclick=async()=>{menu.hidden=true;try{const chat=await window.companion.call('quick-model',{agentId,model:model.id});snapshots.set(agentId,chat);renderControls();}catch(e){showError(e.message);}};menu.append(b);}menu.hidden=!menu.hidden;$('#model-label').setAttribute('aria-expanded',String(!menu.hidden));};
$('#voice').onclick=async()=>{if(islandRecognizing){stopIslandRecording(true);return;}if(islandRecorder?.state==='recording'){stopIslandRecording();return;}try{await window.companion.call('activate-input');islandVoiceCancelled=false;islandStream=await navigator.mediaDevices.getUserMedia({audio:true});await window.companion.call('voice-begin');const parts=[];islandRecorder=new MediaRecorder(islandStream);islandRecorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};islandRecorder.onstop=async()=>{for(const t of islandStream?.getTracks()||[])t.stop();islandStream=null;$('#voice').classList.remove('recording');if(islandVoiceCancelled){$('#input-hint').textContent='Enter 发送 · Shift + Enter 换行';return;}islandRecognizing=true;$('#input-hint').textContent='本机识别中…';try{const base64=await audioToWav(new Blob(parts,{type:islandRecorder.mimeType}));if(islandVoiceCancelled)return;const result=await window.companion.call('quick-voice',{base64,mime:'audio/wav'});if(!islandVoiceCancelled&&expanded){prompt.value+=(prompt.value?' ':'')+result.text;drafts.set(agentId,prompt.value);renderControls();}}catch(e){showError(e.message);}finally{islandRecognizing=false;$('#input-hint').textContent='Enter 发送 · Shift + Enter 换行';}};islandRecorder.start();$('#voice').classList.add('recording');$('#input-hint').textContent='录音中，点击麦克风结束';islandVoiceTimer=setTimeout(()=>stopIslandRecording(),120000);}catch(e){stopIslandRecording(true);showError(e.name==='NotAllowedError'?'麦克风未获允许，请在系统提示中自行确认。':e.message);}};
window.addEventListener('beforeunload',()=>stopIslandRecording(true));
