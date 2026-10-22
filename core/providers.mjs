import { PROVIDERS, normalizeModels } from './catalog.mjs';

export function providerError(status, raw='') {
  const text=String(raw).replace(/sk-[A-Za-z0-9_-]+/g,'[密钥已隐藏]').slice(0,600);
  if(status===401||status===403) return new Error('密钥无效或没有该模型权限，请在模型设置中核对密钥及平台开通状态。');
  if(status===402||/insufficient|balance|quota|余额|额度/i.test(text)) return new Error('平台余额或额度不足，请在对应平台充值后重试。');
  if(status===429) return new Error('平台请求过于频繁，请稍后重试。');
  if(status===404) return new Error('平台找不到这个模型或接口，请刷新模型列表，或填写已开通的模型 ID。');
  return new Error(`模型平台返回错误${status ? `（${status}）` : ''}：${text || '没有返回有效内容'}`);
}

async function checkedFetch(fetchImpl,url,options) {
  let response;
  try { response=await fetchImpl(url,options); }
  catch(error) {
    if(options.signal?.aborted) throw options.signal.reason ?? new Error('请求已取消');
    throw new Error('无法连接模型平台，请检查网络后重试。');
  }
  if(!response.ok) throw providerError(response.status,await response.text());
  return response;
}

const incompleteReply=()=>new Error('回复达到输出长度限制，已保留收到的内容，可以继续追问。');
const interruptedReply=()=>new Error('平台连接中断，未收到完整回复，请重试。');
function completionText(data) {
  const content=data.choices?.[0]?.message?.content;
  return typeof content==='string'?content:Array.isArray(content)?content.map(x=>x.text??'').join(''):
    data.output_text??(data.output??[]).flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
}

export async function parseCompletion(response,onText=()=>{},{signal}={}) {
  signal?.throwIfAborted();
  let text='',model='',usage=null,finished=false,terminal=false,mode='',buffer='',dataLines=[],eventName='',bytes=0;
  const decoder=new TextDecoder(),reader=response.body?.getReader();
  const notify=()=>{onText(text);signal?.throwIfAborted();};
  const cancel=()=>{reader?.cancel(signal?.reason).catch(()=>{});};
  function accept(chunk,type='') {
    signal?.throwIfAborted();
    if(!chunk||typeof chunk!=='object'||Array.isArray(chunk))throw new Error('平台返回了无法读取的流式数据，请稍后重试。');
    type=chunk.type||type;
    if(chunk.error)throw providerError(0,chunk.error.message??JSON.stringify(chunk.error));
    if(type==='error')throw providerError(0,chunk.message??'模型生成失败');
    if(type==='response.failed')throw providerError(0,chunk.response?.error?.message??'模型生成失败');
    model=chunk.model||chunk.response?.model||model;usage=chunk.usage||chunk.response?.usage||usage;
    const delta=chunk.choices?.[0]?.delta?.content;
    if(typeof delta==='string'&&delta){text+=delta;notify();}
    if(type==='response.output_text.delta'&&typeof chunk.delta==='string'&&chunk.delta){text+=chunk.delta;notify();}
    if(type==='response.completed'||type==='response.incomplete'){
      if(!text){text=completionText(chunk.response??{});if(text)notify();}
      if(type==='response.incomplete'||chunk.response?.status==='incomplete')throw incompleteReply();
      finished=true;terminal=true;
    }
    if(chunk.choices?.[0]?.finish_reason==='length')throw incompleteReply();
    if(chunk.choices?.[0]?.finish_reason==='content_filter')throw new Error('平台内容审核中断了回复，已保留收到的内容。');
    if(chunk.choices?.[0]?.finish_reason)finished=true;
  }
  function dispatch() {
    if(!dataLines.length){eventName='';return;}
    const item=dataLines.join('\n').trim(),type=eventName;dataLines=[];eventName='';
    if(!item)return;
    if(item==='[DONE]'){finished=true;terminal=true;return;}
    let chunk;try{chunk=JSON.parse(item);}catch{throw new Error('平台返回了无法读取的流式数据，请稍后重试。');}
    accept(chunk,type);
  }
  function line(value) {
    if(!value){dispatch();return;}
    if(value.startsWith(':'))return;
    const colon=value.indexOf(':'),field=colon<0?value:value.slice(0,colon);
    let payload=colon<0?'':value.slice(colon+1);if(payload.startsWith(' '))payload=payload.slice(1);
    if(field==='data')dataLines.push(payload);else if(field==='event')eventName=payload;
  }
  function consume(decoded,final=false) {
    buffer+=decoded;
    // Some gateways send SSE with a JSON Content-Type, or return JSON despite stream:true.
    if(!mode&&buffer.trimStart())mode=/^[{[]/.test(buffer.trimStart())?'json':'sse';
    if(mode!=='sse')return;
    let match;
    while(!terminal&&(match=/[\r\n]/.exec(buffer))){
      const index=match.index;if(buffer[index]==='\r'&&index===buffer.length-1&&!final)break;
      const width=buffer[index]==='\r'&&buffer[index+1]==='\n'?2:1;
      const value=buffer.slice(0,index);buffer=buffer.slice(index+width);line(value);signal?.throwIfAborted();
    }
    if(final&&!terminal){if(buffer){line(buffer);buffer='';}dispatch();}
  }
  try {
    signal?.addEventListener('abort',cancel,{once:true});signal?.throwIfAborted();
    if(reader){
      while(!terminal){
        let result;try{result=await reader.read();}catch{signal?.throwIfAborted();throw interruptedReply();}
        signal?.throwIfAborted();
        if(result.done){consume(decoder.decode(),true);break;}
        bytes+=result.value.byteLength;if(bytes>8*1024*1024)throw new Error('模型回复超过接收上限，请缩小本次请求后重试。');
        consume(decoder.decode(result.value,{stream:true}));
      }
    }else consume(await response.text(),true);
    signal?.throwIfAborted();
    if(mode==='json'){
      let data;try{data=JSON.parse(buffer);}catch{throw new Error('平台返回了无法读取的回复，请稍后重试。');}
      if(!data||typeof data!=='object')throw new Error('平台未返回有效回复。');
      if(data.error)throw providerError(0,data.error.message??JSON.stringify(data.error));
      if(data.status==='failed')throw providerError(0,data.error?.message??'模型生成失败');
      text=completionText(data);if(!text)throw new Error('模型未返回文字，请切换模型或检查模型权限。');
      notify();if(data.status==='incomplete'||data.choices?.[0]?.finish_reason==='length')throw incompleteReply();
      if(data.choices?.[0]?.finish_reason==='content_filter')throw new Error('平台内容审核中断了回复，已保留收到的内容。');
      return {text,model:data.model,usage:data.usage};
    }
    if(!text)throw new Error('模型未返回文字，请切换模型或稍后重试。');
    if(!finished)throw interruptedReply();
    return {text,model,usage};
  }finally{
    signal?.removeEventListener('abort',cancel);
    if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
}

export function toResponses(messages,model) {
  return {model,stream:true,max_output_tokens:4096,input:messages.map(m=>({role:m.role,content:
    Array.isArray(m.content)?m.content.map(p=>p.type==='image_url'?{type:'input_image',image_url:p.image_url.url}:
      {type:m.role==='assistant'?'output_text':'input_text',text:p.text??''}):m.content}))};
}

export async function generateChat({provider,model,messages,key,signal,onText,fetchImpl=fetch,maxTokens=4096,providerConfig}) {
  const config=providerConfig??PROVIDERS[provider];const base=config?.baseUrl;if(!base)throw new Error('未知模型平台');
  const useResponses=config.api==='responses'||config.api!=='chat'&&provider==='apimart'&&/^gpt-6/.test(model);
  const body=useResponses?toResponses(messages,model):{model,messages,stream:true,max_tokens:4096};
  if(!useResponses&&config.includeUsage===true)body.stream_options={include_usage:true};
  body[useResponses?'max_output_tokens':'max_tokens']=Math.max(256,Math.min(16384,Math.floor(Number(maxTokens)||4096)));
  const timeout=AbortSignal.timeout(180000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await checkedFetch(fetchImpl,`${base}/${useResponses?'responses':'chat/completions'}`,{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:combined
  });
  return parseCompletion(response,onText,{signal:combined});
}

export async function getModels({provider,key,fetchImpl=fetch,signal,providerConfig}) {
  const config=providerConfig??PROVIDERS[provider];const base=config?.baseUrl;if(!base)throw new Error('未知模型平台');
  if(!config.catalogPath)throw new Error('火山方舟使用内置官方模型目录。请在方舟开通服务，或手动添加推理接入点 ID。');
  const response=await checkedFetch(fetchImpl,`${base}${config.catalogPath}`,{
    headers:{Authorization:`Bearer ${key}`},signal:signal??AbortSignal.timeout(30000)
  });
  const data=await response.json();return normalizeModels(data,provider);
}

const delay=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(done,ms);
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};
  signal?.addEventListener('abort',abort,{once:true});
});

export function collectImages(data) {
  const images=[];
  const walk=(value,depth=0)=>{
    if(depth>7||!value)return;
    if(Array.isArray(value)){value.forEach(x=>walk(x,depth+1));return;}
    if(typeof value!=='object')return;
    if(typeof value.b64_json==='string')images.push({base64:value.b64_json,mime:'image/png'});
    else if(typeof value.url==='string'&&/^https:\/\//.test(value.url))images.push({url:value.url});
    else if(Array.isArray(value.url))for(const url of value.url)if(typeof url==='string'&&/^https:\/\//.test(url))images.push({url});
    for(const [name,item]of Object.entries(value))if(!['url','b64_json','error'].includes(name))walk(item,depth+1);
  };
  walk(data);return images.slice(0,4);
}

export async function generateImage({provider,model,prompt,key,signal,referenceImages=[],fetchImpl=fetch,onProgress=()=>{},providerConfig}) {
  const base=(providerConfig??PROVIDERS[provider])?.baseUrl;if(!base)throw new Error('未知模型平台');
  const timeout=AbortSignal.timeout(600000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const resolution=model==='seedream-5-0-lite'?'2K':model==='gemini-3.1-flash-image-preview'?'1K':'1k';
  const body={model,prompt,...(provider==='volcano'?{size:'2K',response_format:'url',watermark:true}:{size:'1:1',resolution,n:1})};
  if(referenceImages.length){
    if(provider==='volcano')body.image=referenceImages.map(item=>`data:${item.mime};base64,${item.base64}`);
    else {
      body.image_urls=[];
      for(const item of referenceImages){
        const form=new FormData();form.append('file',new Blob([Buffer.from(item.base64,'base64')],{type:item.mime}),item.name??'reference.png');
        const upload=await checkedFetch(fetchImpl,`${base}/uploads/images`,{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:combined});
        const asset=await upload.json();if(typeof asset.url!=='string'||!asset.url.startsWith('https://'))throw new Error('参考图上传失败，平台未返回有效地址');body.image_urls.push(asset.url);
      }
    }
  }
  const response=await checkedFetch(fetchImpl,`${base}/images/generations`,{method:'POST',headers,body:JSON.stringify(body),signal:combined});
  let data=await response.json();
  if(data.error)throw providerError(0,data.error.message??JSON.stringify(data.error));
  let images=collectImages(data);if(images.length)return images;
  const taskId=data.data?.[0]?.task_id??data.data?.task_id??data.task_id;
  if(!taskId||provider!=='apimart')throw new Error('平台未返回图片或可查询的任务，请检查该作图模型是否已开通。');
  for(let attempt=0;attempt<60;attempt++) {
    onProgress(`图像生成中，已等待 ${attempt*5} 秒…`);
    await delay(5000,combined);
    const result=await checkedFetch(fetchImpl,`${base}/tasks/${encodeURIComponent(taskId)}`,{headers,signal:combined});
    data=await result.json();
    const task=data.data??data;
    if(['failed','error','cancelled'].includes(task.status))throw providerError(0,task.error?.message??task.error??'图像任务失败');
    images=collectImages(task);if(images.length)return images;
  }
  throw new Error('图片生成超时，请稍后在平台查看任务记录。');
}
