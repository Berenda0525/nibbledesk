/** 只提取模型返回的用量字段，不保存原生 Harness 的正文。 */
export function usageTap(contentType){
 const stream=contentType?.includes('text/event-stream'),decoder=new TextDecoder();let pending='',latest;
 const inspect=value=>{if(value?.usage)latest=value.usage;if(value?.response?.usage)latest=value.response.usage;};
 return {push(chunk){pending+=decoder.decode(chunk,{stream:true});if(stream){const lines=pending.split('\n');pending=lines.pop();for(const line of lines)if(line.startsWith('data:'))try{inspect(JSON.parse(line.slice(5)));}catch{};}if(pending.length>1024*1024)pending='';},finish(){pending+=decoder.decode();try{inspect(JSON.parse(stream?pending.replace(/^data:\s*/,''):pending));}catch{}return latest;}};
}
