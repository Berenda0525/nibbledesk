import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandChatController} from '../core/island-chat.mjs';

function fixture(){
  const state={agents:[{id:'claude',provider:'apimart',model:'mock'}],models:[{id:'mock',name:'测试模型',provider:'apimart',kind:'chat'}],assets:[],profile:{},chats:[{id:'island-stream',type:'direct',entryPoint:'island',agentIds:['claude'],running:true,messages:[{id:'history',role:'user',content:'保留历史',status:'complete'},{id:'reply',role:'assistant',content:'',status:'streaming'}]}]};
  const delivered=[];
  const controller=createIslandChatController({service:{getState:async()=>state},onSnapshot:value=>delivered.push(value)});
  controller.handleEvent({type:'state',state});
  delivered.length=0;
  const delta=(text,messageId='reply',chatId='island-stream')=>{state.chats[0].messages[1].content=text;controller.handleEvent({type:'delta',chatId,messageId,text});};
  return {state,controller,delivered,delta};
}

test('streaming a changed message does not serialize full history for comparison',t=>{
  const {delta,delivered}=fixture();
  const stringify=JSON.stringify;
  let historyComparisons=0;
  t.mock.method(JSON,'stringify',function(value,...args){
    if(value?.chatId==='island-stream'&&Array.isArray(value.messages))historyComparisons++;
    return stringify.call(this,value,...args);
  });
  for(let i=1;i<=240;i++)delta('逐段回复'.repeat(i));
  assert.equal(delivered.length,240);
  assert.equal(delivered.at(-1).messages.at(-1).content,'逐段回复'.repeat(240));
  assert.equal(historyComparisons,0,'已知变化的单条消息不应反复序列化整份历史');
});

test('stream snapshots remain isolated and final state is delivered immediately',()=>{
  const {state,controller,delta,delivered}=fixture();
  delta('第一段');
  const first=delivered[0];
  first.messages[0].content='外部修改';
  first.messages[1].content='篡改回复';
  first.models[0].name='外部模型';
  delta('第一段，第二段');
  const second=delivered[1];
  assert.equal(second.messages[0].content,'保留历史');
  assert.equal(second.messages[1].content,'第一段，第二段');
  assert.equal(second.models[0].name,'测试模型');
  assert.notEqual(first.messages,second.messages);
  assert.equal(first.messages[1].content,'篡改回复');
  state.chats[0].running=false;
  state.chats[0].messages[1].status='complete';
  controller.handleEvent({type:'state',state});
  assert.equal(delivered.at(-1).running,false);
  assert.equal(delivered.at(-1).messages.at(-1).status,'complete');
});

test('unchanged previews and unrelated events do not publish stream snapshots',()=>{
  const {delta,delivered}=fixture();
  delta('可见内容');delta('可见内容');
  assert.equal(delivered.length,1);
  delta('其他内容','missing');delta('其他对话','reply','missing');
  assert.equal(delivered.length,1);
  const prefix='文'.repeat(24000);
  delta(prefix+'尾部一');delta(prefix+'尾部二');
  assert.equal(delivered.length,2);
  assert.match(delivered.at(-1).messages.at(-1).content,/继续查看完整内容/);
});
