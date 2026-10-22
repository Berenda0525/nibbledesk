import {priceFor,estimateCost} from './pricing.mjs';
const numeric=value=>Number.isFinite(Number(value))&&Number(value)>=0?Number(value):0;
export function normalizeUsage(raw){
 if(!raw||typeof raw!=='object'||!['prompt_tokens','input_tokens','inputTokens','completion_tokens','output_tokens','outputTokens','total_tokens','totalTokens'].some(k=>raw[k]!==undefined&&Number.isFinite(Number(raw[k]))))return null;
 const input=numeric(raw.prompt_tokens??raw.input_tokens??raw.inputTokens),output=numeric(raw.completion_tokens??raw.output_tokens??raw.outputTokens);
 const result={input,output,total:numeric(raw.total_tokens??raw.totalTokens)||input+output,cached:numeric(raw.prompt_tokens_details?.cached_tokens??raw.input_tokens_details?.cached_tokens??raw.cache_read_input_tokens??raw.cacheReadTokens)};
 const write5=numeric(raw.claude_cache_creation_5_m_tokens??raw.cache_creation?.ephemeral_5m_input_tokens??raw.prompt_tokens_details?.cache_write_tokens??raw.cache_creation_input_tokens),writeHour=numeric(raw.claude_cache_creation_1_h_tokens??raw.cache_creation?.ephemeral_1h_input_tokens);if(write5)result.write5=write5;if(writeHour)result.writeHour=writeHour;return result;
}
/** 按本机消息归属统计 Agent；平台余额独立展示，不能当作 Agent 账单。 */
export function summarizeUsage(state,days=90,definitions={}){
 days=Math.max(7,Math.min(366,Number(days)||90));const since=Date.now()-days*86400000;
 const agents=state.agents.map(a=>({id:a.id,name:a.name,requests:0,input:0,output:0,total:0,unknown:0,costs:[],unpriced:0}));if(state.nativeUsage?.some(v=>v.agentId==='harness'))agents.push({id:'harness',name:'Harness 其他模型',requests:0,input:0,output:0,total:0,unknown:0,costs:[],unpriced:0});const byAgent=new Map(agents.map(a=>[a.id,a]));const daily=new Map(),costs=[];const add=(rows,fee)=>{const row=rows.find(r=>r.currency===fee.currency);if(row)row.amount+=fee.amount;else rows.push({currency:fee.currency,amount:fee.amount});};
 for(const chat of [...state.chats,{messages:state.nativeUsage??[]}])for(const m of chat.messages??[]){const time=new Date(m.createdAt).getTime();if(m.role!=='assistant'||!Number.isFinite(time)||time<since)continue;const a=byAgent.get(m.agentId);if(!a)continue;
  a.requests++;const u=normalizeUsage(m.usage);if(!u){a.unknown++;continue;}a.input+=u.input;a.output+=u.output;a.total+=u.total;
  const price=priceFor(m.provider,m.model,state,definitions),fee=estimateCost(u,price,{createdAt:m.createdAt,kind:m.kind});if(fee){add(a.costs,fee);add(costs,fee);}else a.unpriced++;
  const date=new Date(m.createdAt).toLocaleDateString('sv-SE');const row=daily.get(date)??{date,total:0,requests:0};row.total+=u.total;row.requests++;daily.set(date,row);
 }
 return {days,agents,costs,unpriced:agents.reduce((n,a)=>n+a.unpriced,0),daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),total:agents.reduce((n,a)=>n+a.total,0),requests:agents.reduce((n,a)=>n+a.requests,0),unknown:agents.reduce((n,a)=>n+a.unknown,0),source:'本机调用响应'};
}
export async function syncBalances({definitions,keys,fetchImpl=fetch}){
 const result={updatedAt:new Date().toISOString(),providers:{}};
 for(const [id,p]of Object.entries(definitions)){
  if(!await keys.get(id))continue;
  // 仅使用官方公布的余额接口。不同中转的私有账单接口不能互相猜测调用。
  if(id!=='deepseek'||p.baseUrl!=='https://api.deepseek.com'){result.providers[id]={status:'unsupported',message:'该服务尚未提供已核实的 API Key 用量接口；按本机调用响应统计。'};continue;}
  try{const response=await fetchImpl('https://api.deepseek.com/user/balance',{headers:{Authorization:`Bearer ${await keys.get(id)}`},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`余额同步失败（HTTP ${response.status}）`);const body=await response.json();if(!Array.isArray(body.balance_infos))throw new Error('余额响应格式无效');result.providers[id]={status:'synced',balances:body.balance_infos.slice(0,5).map(v=>({currency:String(v.currency).slice(0,8),total:String(v.total_balance).slice(0,40)}))};}
  catch(e){result.providers[id]={status:'error',message:String(e.message).slice(0,200)};}
 }
 return result;
}
