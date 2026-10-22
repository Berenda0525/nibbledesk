const checkedAt='2026-10-22';
const apimart=(family,prices)=>({...prices,currency:'USD',source:`https://apimart.ai/zh/model/llm/${family}`,basis:'APImart 公开黄金档参考价',checkedAt});
/** 公开报价用于估算，账号折扣、工具与图片费用以平台账单为准。 */
export const REFERENCE_PRICES=Object.freeze({
 'apimart:claude-opus-5-5':apimart('claude',{input:3.2,output:16,cache:.16,write5:4,writeHour:6.4}),
 'apimart:claude-haiku-5-5':apimart('claude',{input:.08,output:.4,cache:.008,write5:.1}),
 'apimart:gpt-6.1-sol':apimart('gpt',{input:1.6,output:8,cache:.16,write5:2,tier:{above:272000,input:3.2,output:14,cache:.32,write5:4}}),
 'apimart:gemini-4-argon':apimart('gemini',{input:1.6,output:8,cache:.08}),
 'apimart:kimi-k3':apimart('kimi',{input:2.4,output:12,cache:.24}),
 'apimart:deepseek-v4.1-flash':apimart('deepseek',{input:.22857,output:.91429,cache:.02286,offPeak:{input:.11429,output:.45714,cache:.01143}}),
 'deepseek:deepseek-flash':{input:.3,output:1.2,cache:.006,currency:'USD',basis:'DeepSeek 官方高峰参考价',source:'https://api-docs.deepseek.com/quick_start/pricing/',checkedAt},
 'deepseek:deepseek-v4-pro':{input:1.32,output:3.96,cache:.044,currency:'USD',basis:'DeepSeek 官方高峰参考价',source:'https://api-docs.deepseek.com/quick_start/pricing/',checkedAt},
});
export function validatePrice(p){
 const result={currency:p.currency??'USD',basis:'用户设置单价',checkedAt:new Date().toISOString().slice(0,10)};
 if(!['USD','CNY'].includes(result.currency))throw Error('请选择 USD 或 CNY');
 for(const k of ['input','output','cache','write5','writeHour']){if(p[k]===undefined||p[k]===''||p[k]===null){if(['input','output'].includes(k))throw Error('请输入输入和输出单价');continue;}const value=Number(p[k]);if(!Number.isFinite(value)||value<0||value>1000000)throw Error('单价必须是 0 至 1000000 的数字');result[k]=value;}
 return result;
}
export function priceFor(provider,model,state,definitions){
 const key=provider+':'+model;if(Object.hasOwn(state.pricingOverrides||{},key))return state.pricingOverrides[key];
 const expected={apimart:'https://api.apimart.ai/v1',deepseek:'https://api.deepseek.com'};
 if(expected[provider]&&definitions[provider]?.baseUrl!==expected[provider])return null;
 return REFERENCE_PRICES[key]??null;
}
export function estimateCost(usage,price,{createdAt,kind}={}){
 if(!usage||!price)return null;
 let rate=price;
 if(price.offPeak){const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date(createdAt||Date.now())));if(hour<8||hour>=22)rate={...price,...price.offPeak};}
 if(price.tier&&usage.input>price.tier.above)rate={...rate,...price.tier};
 const cached=Math.min(usage.input,usage.cached||0),write5=Math.min(Math.max(0,usage.input-cached),usage.write5||0),writeHour=Math.min(Math.max(0,usage.input-cached-write5),usage.writeHour||0);
 const input=Math.max(0,usage.input-cached-write5-writeHour);
 const amount=(input*rate.input+usage.output*rate.output+cached*(rate.cache??rate.input)+write5*(rate.write5??rate.input)+writeHour*(rate.writeHour??rate.write5??rate.input))/1000000;
 return {currency:rate.currency,amount,basis:rate.basis,source:rate.source,checkedAt:rate.checkedAt,estimated:true,aggregateTask:kind==='task'};
}
