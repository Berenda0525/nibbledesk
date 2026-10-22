import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {usageTap} from './usage-stream.mjs';
/** 原生 Harness 只持有本机短期令牌；平台密钥始终留在瓜瓜宿主。 */
export async function startHarnessProxy({getState,keys,definitions,fetchImpl=fetch,onUsage=()=>{}}){
 const token=randomBytes(32).toString('hex');let origin,inFlight=0;const controllers=new Set();
 const server=createServer((req,res)=>{(async()=>{
  if(req.headers.host!==new URL(origin).host||req.headers.authorization!=='Bearer '+token||req.method!=='POST'||req.headers.origin){res.writeHead(403).end();return;}
  const route=new URL(req.url,origin).pathname.match(/^\/proxy\/([a-z][a-z0-9_-]{0,63})\/(chat\/completions|responses)$/);if(!route){res.writeHead(404).end();return;}
  if(inFlight>=8){res.writeHead(429).end('本机请求过多');return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32*1024*1024){res.writeHead(413).end();return;}}
  let body;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{res.writeHead(400).end();return;}
  const state=await getState(),provider=route[1],config=definitions(state)[provider];
  if(!config||!state.models.some(m=>m.provider===provider&&m.id===body?.model&&m.kind==='chat')){res.writeHead(400).end('请选择已配置模型');return;}
  const key=await keys.get(provider);if(!key){res.writeHead(401).end('请先在瓜瓜配置模型服务');return;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);controllers.add(controller);inFlight++;
  const stop=()=>{if(!res.writableEnded)controller.abort();};res.once('close',stop);
  try{
   const response=await fetchImpl(config.baseUrl+'/'+route[2],{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:controller.signal});
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store'});
   const tap=usageTap(response.headers.get('content-type'));let bytes=0;for await(const chunk of response.body??[]){bytes+=chunk.length;if(bytes>64*1024*1024)throw Error('模型响应超出限制');tap.push(chunk);if(!res.write(chunk))await new Promise(resolve=>{res.once('drain',resolve);res.once('close',resolve);});}res.end();const usage=tap.finish();if(usage&&response.ok)await onUsage({provider,model:body.model,usage});
  }finally{clearTimeout(timer);controllers.delete(controller);inFlight--;res.removeListener('close',stop);}
 })().catch(()=>{if(!res.headersSent)res.writeHead(502);res.end('模型服务连接失败，请检查瓜瓜模型设置与平台额度');});});
 server.headersTimeout=15000;server.requestTimeout=200000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 return {origin,token,async close(){for(const c of controllers)c.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

export function harnessProviders(state,definitions,origin){
 const providers={};let selection;
 for(const [id,config]of Object.entries(definitions)){
  if(!state.providers[id]?.configured)continue;
  for(const model of state.models.filter(m=>m.kind==='chat'&&m.provider===id)){
   const api=config.api==='responses'||config.api==='auto'&&/^(gpt|codex|o[1-9])/i.test(model.id)?'openai-responses':'openai-completions',route='guagua-'+id+'-'+(api==='openai-responses'?'responses':'chat');
   providers[route]??={displayName:config.name+' · '+(api==='openai-responses'?'Responses':'Chat'),api,baseURL:origin+'/proxy/'+id,apiKeyEnv:'GUAGUA_HARNESS_ACCESS',retryPolicy:{mode:'normal',maxRetries:0},models:[]};
   providers[route].models.push({id:model.id,name:model.name||model.id,input:model.vision?['text','image']:['text'],contextWindow:128000,maxTokens:8192});
   if(state.agents[0]?.provider===id&&state.agents[0]?.model===model.id)selection={provider:route,model:model.id};
  }
 }
 selection??=Object.entries(providers).map(([id,p])=>({provider:id,model:p.models[0]?.id})).find(v=>v.model);
 return {providers,selection};
}
