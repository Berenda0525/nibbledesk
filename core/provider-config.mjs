import {PROVIDERS} from './catalog.mjs';

export function validProviderId(id){return typeof id==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(id)&&!['constructor','prototype'].includes(id);}
export function normalizeProvider(input,previous={}){
 const id=input.provider??input.id;
 if(!validProviderId(id))throw new Error('模型服务标识无效');
 const fallback=PROVIDERS[id]??previous;
 const name=String(input.name??previous.name??fallback.name??id).trim().slice(0,60);
 const url=new URL(String(input.baseUrl??previous.baseUrl??fallback.baseUrl??''));
 if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('请填写 HTTPS 服务地址；本机服务可使用 HTTP');
 const api=input.api??previous.api??fallback.api??'auto';
 const includeUsage=input.includeUsage??previous.includeUsage??fallback.includeUsage??id==='deepseek';
 if(typeof includeUsage!=='boolean')throw new Error('流式用量设置无效');
 if(!['auto','chat','responses'].includes(api))throw new Error('请选择正确的接口协议');
 return {id,name,baseUrl:url.href.replace(/\/+$/,''),api,includeUsage,catalogPath:id==='volcano'?null:id==='apimart'?'/models?expand=category':'/models',...(id==='deepseek'?{balanceUrl:'https://api.deepseek.com/user/balance'}:{})};
}
export function providerDefinitions(saved={}){
 const result=Object.fromEntries(Object.entries(PROVIDERS).map(([id,p])=>[id,{...p,id,api:p.api??'auto',includeUsage:p.includeUsage??id==='deepseek'}]));
 for(const [id,input]of Object.entries(saved))if(validProviderId(id))result[id]=normalizeProvider({...input,provider:id},result[id]);
 return result;
}
