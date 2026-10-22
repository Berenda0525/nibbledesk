import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProvider,providerDefinitions} from '../core/provider-config.mjs';
import {normalizeUsage,summarizeUsage,syncBalances} from '../core/usage.mjs';
import {generateChat} from '../core/providers.mjs';
test('自定义服务地址及协议受控，拒绝凭据嵌入和非本机明文地址',()=>{
 const p=normalizeProvider({provider:'custom-relay',name:'自己的服务',baseUrl:'https://relay.example/v1/',api:'responses'});assert.equal(p.baseUrl,'https://relay.example/v1');assert.equal(p.api,'responses');
 assert.equal(normalizeProvider({provider:'local',baseUrl:'http://127.0.0.1:8000/v1'}).catalogPath,'/models');
 for(const provider of ['__proto__','constructor','../escape'])assert.throws(()=>normalizeProvider({provider,baseUrl:'https://example.com'}));
 for(const baseUrl of ['http://relay.example/v1','https://key@example.com','https://example.com?key=secret','file:///a'])assert.throws(()=>normalizeProvider({provider:'custom',baseUrl}));
 assert.equal(providerDefinitions({'custom-relay':p})['custom-relay'].name,'自己的服务');
});
test('实际调用遵循自定义 Chat 地址与密钥，不回退到 APImart',async()=>{
 let request;const result=await generateChat({provider:'custom-relay',providerConfig:normalizeProvider({provider:'custom-relay',baseUrl:'https://relay.example/v1',api:'chat'}),model:'claude-test',key:'fixture-only',messages:[{role:'user',content:'hi'}],fetchImpl:async(url,options)=>{request={url:String(url),options};return new Response(JSON.stringify({choices:[{message:{content:'ok'}}],usage:{prompt_tokens:2,completion_tokens:1,total_tokens:3}}),{headers:{'Content-Type':'application/json'}});}});
 assert.equal(request.url,'https://relay.example/v1/chat/completions');assert.equal(request.options.headers.Authorization,'Bearer fixture-only');assert.equal(result.text,'ok');
});
test('助手用量来自响应，未知值和错误日期不会制造 Token',()=>{
 const state={agents:[{id:'claude',name:'Claude'}],chats:[{messages:[{role:'assistant',agentId:'claude',createdAt:new Date().toISOString(),usage:{prompt_tokens:10,completion_tokens:3}},{role:'assistant',agentId:'claude',createdAt:new Date().toISOString()},{role:'assistant',agentId:'claude',createdAt:'bad',usage:{total_tokens:99999}}]}]};
 const value=summarizeUsage(state,30);assert.equal(value.total,13);assert.equal(value.unknown,1);assert.equal(value.requests,2);assert.equal(value.daily.length,1);assert.equal(normalizeUsage(null),null);
});
test('余额只调用已核实的官方端点，APImart 和自定义服务不会收到猜测请求',async()=>{
 const requests=[];const result=await syncBalances({definitions:providerDefinitions({'custom-relay':{provider:'custom-relay',baseUrl:'https://example.com'}}),keys:{get:async()=> 'fixture-only'},fetchImpl:async(url,options)=>{requests.push({url,options});return Response.json({balance_infos:[{currency:'CNY',total_balance:'1.23'}]});}});
 assert.equal(requests.length,1);assert.equal(requests[0].url,'https://api.deepseek.com/user/balance');assert.equal(requests[0].options.redirect,'error');assert.equal(result.providers.apimart.status,'unsupported');assert.equal(result.providers.deepseek.balances[0].total,'1.23');
});
