import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationEntries} from '../core/conversation-navigation.mjs';
test('同一 Agent 的多个历史会话只显示一个联系人入口，历史和群聊保留',()=>{
 const chats=Array.from({length:6},(_,i)=>({id:'c'+i,type:'direct',agentIds:['claude'],title:'刘海 · Claude',messages:[],updatedAt:new Date(i*1000).toISOString()}));
 chats[0].messages=[{content:'需要保留的项目记录'}];chats.push({id:'g',type:'group',title:'项目组',agentIds:['claude','kimi'],messages:[]});
 const state={agents:[{id:'claude',name:'Claude'},{id:'kimi',name:'Kimi'}],chats};
 const rows=conversationEntries(state,{activeId:'c1'});assert.equal(rows.length,3);assert.equal(rows[0].title,'Claude');assert.equal(rows[0].chat.id,'c1');assert.equal(rows[2].title,'项目组');assert.equal(state.chats.length,7);
 assert.equal(conversationEntries(state,{query:'项目记录'})[0].agent.id,'claude');
 assert.equal(conversationEntries(state,{selected:{claude:'c2'}})[0].chat.id,'c2');
});
