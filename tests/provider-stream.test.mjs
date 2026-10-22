import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {parseCompletion,generateChat,toResponses} from '../core/providers.mjs';

const encoder=new TextEncoder();
const event=(data,ending='\n\n')=>'data: '+JSON.stringify(data)+ending;
const chunk=(content,finish_reason=null)=>({model:'original-model',choices:[{index:0,delta:{content},finish_reason}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function controlled(headers={}){
  let controller,cancelled=false;
  const response=new Response(new ReadableStream({start(value){controller=value;},cancel(){cancelled=true;}}),{headers});
  return {response,write(value){controller.enqueue(typeof value==='string'?encoder.encode(value):value);},close(){controller.close();},error(value){controller.error(value);},get cancelled(){return cancelled;}};
}

test('first SSE text reaches the caller before the response body closes',async()=>{
  const stream=controlled({'content-type':'text/event-stream'}),deltas=[];
  const result=parseCompletion(stream.response,text=>deltas.push(text));
  stream.write(event(chunk('首段')));await tick();const beforeClose=[...deltas];
  stream.write(event(chunk('，完成','stop'))+'data: [DONE]\n\n');stream.close();
  assert.equal((await result).text,'首段，完成');assert.deepEqual(beforeClose,['首段']);
});

test('UTF-8 bytes, CRLF boundaries, multiline data and comment events may all be split',async()=>{
  const stream=controlled(),deltas=[];
  const result=parseCompletion(stream.response,value=>deltas.push(value));
  const raw='\uFEFF: heartbeat\r\n\r\nid: 7\r\nevent: message\r\ndata: {"model":"中文模型",\r\ndata: "choices":[{"delta":{"content":"你好🌙"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  for(const byte of encoder.encode(raw))stream.write(new Uint8Array([byte]));stream.close();
  assert.deepEqual(await result,{text:'你好🌙',model:'中文模型',usage:null});assert.deepEqual(deltas,['你好🌙']);
});

test('usage-only frames after finish_reason are retained without empty text updates',async()=>{
  const deltas=[];
  const raw=event(chunk(''))+event(chunk('答案','stop'))+event({choices:[],usage:{prompt_tokens:8,completion_tokens:2}})+'data: [DONE]\n\n';
  const result=await parseCompletion(new Response(raw, {headers:{'content-type':'application/json'}}),value=>deltas.push(value));
  assert.deepEqual(result.usage,{prompt_tokens:8,completion_tokens:2});assert.deepEqual(deltas,['答案']);
});

test('DONE settles a stream without waiting for the server to close the transport', {timeout:2000},async()=>{
  const stream=controlled();const result=parseCompletion(stream.response);
  stream.write(event(chunk('完成'))+'data: [DONE]\n\n');
  assert.equal((await result).text,'完成');assert.equal(stream.cancelled,true);
});

test('a final finish frame without a trailing newline is accepted at EOF',async()=>{
  const raw=event(chunk('hello'))+event(chunk('', 'stop'),'');
  assert.equal((await parseCompletion(new Response(raw))).text,'hello');
});

test('Responses events stream deltas and consume completed metadata without duplicating text',{timeout:2000},async()=>{
  const stream=controlled(),deltas=[];const result=parseCompletion(stream.response,value=>deltas.push(value));
  stream.write('event: response.output_text.delta\ndata: {"delta":"第一段"}\n\n');await tick();assert.deepEqual(deltas,['第一段']);
  stream.write(event({type:'response.output_text.delta',delta:'继续'}));
  stream.write(event({type:'response.completed',response:{model:'gpt-6.1-sol',usage:{input_tokens:5,output_tokens:2},output:[{content:[{type:'output_text',text:'第一段继续'}]}]}}));
  assert.deepEqual(await result,{text:'第一段继续',model:'gpt-6.1-sol',usage:{input_tokens:5,output_tokens:2}});
  assert.deepEqual(deltas,['第一段','第一段继续']);assert.equal(stream.cancelled,true);
});

test('Responses final-only completion and JSON fallback keep the complete response text',async()=>{
  const output=[{type:'message',content:[{type:'output_text',text:'最终答案'}]}];
  assert.equal((await parseCompletion(new Response(event({type:'response.completed',response:{output}})))).text,'最终答案');
  const json=JSON.stringify({model:'gpt-model',output,usage:{input_tokens:2}});
  assert.equal((await parseCompletion(new Response(' \n'+json,{headers:{'content-type':'text/event-stream'}}))).text,'最终答案');
  assert.equal((await parseCompletion(new Response(JSON.stringify({choices:[{message:{content:[{type:'text',text:'文字'}]}}]})))).text,'文字');
});

test('length limits and incomplete Responses keep the text already delivered',async()=>{
  for(const raw of [
    event(chunk('部分回答','length')),
    event({type:'response.output_text.delta',delta:'部分回答'})+event({type:'response.incomplete',response:{status:'incomplete'}}),
    event({type:'response.incomplete',response:{output:[{content:[{type:'output_text',text:'部分回答'}]}]}}),
    JSON.stringify({status:'incomplete',output_text:'部分回答'}),
  ]){
    let text='';await assert.rejects(parseCompletion(new Response(raw),value=>text=value),/长度限制/);assert.equal(text,'部分回答');
  }
});

test('provider and malformed stream errors retain preceding text and cancel the body',async()=>{
  for(const [suffix,pattern] of [
    [event({error:{message:'insufficient quota'}}),/余额/],
    [event({type:'response.failed',response:{error:{message:'upstream failed'}}}),/upstream failed/],
    ['event: error\ndata: {"message":"invalid request sk-PRIVATE_TEST_VALUE"}\n\n',/密钥已隐藏/],
    ['data: {bad json}\n\n',/流式数据/],
    [event(chunk('', 'content_filter')),/内容审核/],
  ]){
    const stream=controlled();let text='';const result=parseCompletion(stream.response,value=>text=value);
    const rejected=assert.rejects(result,pattern);stream.write(event(chunk('已收到'))+suffix);await rejected;
    assert.equal(text,'已收到');assert.equal(stream.cancelled,true);
  }
});

test('EOF before a completion marker and body errors retain partial text',async()=>{
  let text='';await assert.rejects(parseCompletion(new Response(event(chunk('半句'))),value=>text=value),/中断/);assert.equal(text,'半句');
  const stream=controlled(),result=parseCompletion(stream.response,value=>text=value),rejected=assert.rejects(result,/中断/);
  stream.write(event(chunk('第一段')));await tick();stream.error(new Error('connection reset'));await rejected;assert.equal(text,'第一段');
});

test('abort interrupts a pending reader, keeps partial text and prevents further updates',{timeout:2000},async()=>{
  const stream=controlled(),controller=new AbortController(),deltas=[];
  const result=parseCompletion(stream.response,value=>deltas.push(value),{signal:controller.signal});
  const rejected=assert.rejects(result,/用户停止/);
  stream.write(event(chunk('已输出')));await tick();controller.abort(new Error('用户停止'));await rejected;
  assert.deepEqual(deltas,['已输出']);assert.equal(stream.cancelled,true);
});

test('abort from the text callback stops later frames in the same network chunk',async()=>{
  const controller=new AbortController(),deltas=[];
  const raw=event(chunk('first'))+event(chunk('second','stop'))+'data: [DONE]\n\n';
  await assert.rejects(parseCompletion(new Response(raw),value=>{deltas.push(value);controller.abort(new Error('停止'));},{signal:controller.signal}),/停止/);
  assert.deepEqual(deltas,['first']);
});

test('generateChat uses streaming on original provider/model paths and supports JSON-only gateways',async()=>{
  for(const [provider,model,endpoint] of [
    ['apimart','claude-opus-5-5','chat/completions'],['apimart','gemini-4-argon','chat/completions'],
    ['apimart','deepseek-v4','chat/completions'],['apimart','kimi-k2.5','chat/completions'],
    ['apimart','gpt-6.1-sol','responses'],['volcano','doubao-seed-2-0-pro-260215','chat/completions'],
  ]){
    let calls=0;
    const result=await generateChat({provider,model,key:'LOCAL_TEST_KEY',messages:[{role:'user',content:'你好'}],maxTokens:700,fetchImpl:async(url,options)=>{
      calls++;const body=JSON.parse(options.body);assert.ok(url.endsWith('/'+endpoint));assert.equal(body.model,model);assert.equal(body.stream,true);
      assert.equal(body[endpoint==='responses'?'max_output_tokens':'max_tokens'],700);assert.equal(body.stream_options,undefined);
      return new Response(JSON.stringify({choices:[{message:{content:'JSON 兼容回复'}}]}));
    }});
    assert.equal(result.text,'JSON 兼容回复');assert.equal(calls,1);
  }
  const body=toResponses([{role:'assistant',content:[{type:'text',text:'答'}]},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,eA=='}}]}],'gpt-6.1-sol');
  assert.equal(body.input[0].content[0].type,'output_text');assert.equal(body.input[1].content[0].type,'input_image');
});

test('generateChat propagates cancellation through body consumption, without provider retry',{timeout:2000},async()=>{
  const stream=controlled(),controller=new AbortController(),deltas=[];let calls=0;
  const result=generateChat({provider:'apimart',model:'claude-opus-5-5',key:'LOCAL_TEST_KEY',messages:[],signal:controller.signal,onText:value=>deltas.push(value),fetchImpl:async()=>{calls++;return stream.response;}});
  const rejected=assert.rejects(result,/已停止/);stream.write(event(chunk('部分文本')));await tick();controller.abort(new Error('已停止'));await rejected;
  assert.deepEqual(deltas,['部分文本']);assert.equal(stream.cancelled,true);assert.equal(calls,1);
});

test('HTTP model failures make one request and preserve the existing platform error',async()=>{
  let calls=0;
  await assert.rejects(generateChat({provider:'apimart',model:'claude-opus-5-5',key:'LOCAL_TEST_KEY',messages:[],fetchImpl:async()=>{calls++;return new Response('{"error":{"message":"insufficient balance"}}',{status:402});}}),/余额/);
  assert.equal(calls,1);
});

test('empty, malformed JSON and excessive responses fail clearly',async()=>{
  await assert.rejects(parseCompletion(new Response('data: [DONE]\n\n')),/未返回文字/);
  await assert.rejects(parseCompletion(new Response('{broken')),/无法读取的回复/);
  await assert.rejects(parseCompletion(new Response('x'.repeat(8*1024*1024+1))),/接收上限/);
});

test('a real local HTTP response publishes text before EOF and cancellation closes the socket',{timeout:5000},async t=>{
  let response,requestBody,firstText;
  const first=new Promise(resolve=>firstText=resolve),disconnected=Promise.withResolvers();
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;requestBody=JSON.parse(body);response=res;
    res.on('close',()=>disconnected.resolve());res.writeHead(200,{'content-type':'text/event-stream'});
    res.write(event(chunk('本地网络首段')));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const controller=new AbortController(),deltas=[];let settled=false;
  const result=generateChat({provider:'apimart',model:'claude-opus-5-5',key:'LOCAL_FAKE_ONLY',messages:[{role:'user',content:'测试'}],signal:controller.signal,onText:value=>{deltas.push(value);firstText();},fetchImpl:(_url,options)=>fetch(`http://127.0.0.1:${server.address().port}/completion`,options)});
  const rejected=assert.rejects(result,/用户停止/).then(()=>settled=true);
  await first;assert.equal(settled,false);assert.equal(response.writableEnded,false);assert.equal(requestBody.stream,true);
  controller.abort(new Error('用户停止'));await rejected;await disconnected.promise;
  assert.deepEqual(deltas,['本地网络首段']);
});
