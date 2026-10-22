/** 附件草稿按伙伴隔离；导入完成后由用户主动发送。 */
export function createIslandAttachments({root,getAgent,onChange,onError}){
 const drafts=new Map(),host=document.querySelector('#attachments');let importing=false,expanding=false;
 const get=id=>drafts.get(id)||[];
 const render=()=>{host.replaceChildren();for(const file of get(getAgent())){const chip=document.createElement('span'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name;remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','移除 '+file.name);remove.onclick=()=>{drafts.set(getAgent(),get(getAgent()).filter(v=>v.id!==file.id));render();onChange();};chip.append(name,remove);host.append(chip);}host.hidden=!host.children.length;};
 root.addEventListener('dragover',event=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';root.classList.add('file-drag');if(!expanding){expanding=true;window.companion.call('expand').catch(()=>{}).finally(()=>expanding=false);}});
 root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))root.classList.remove('file-drag');});
 root.addEventListener('drop',async event=>{event.preventDefault();root.classList.remove('file-drag');const agentId=getAgent(),files=[...event.dataTransfer.files];if(importing||!agentId||!files.length)return;importing=true;
  try{if(files.length+get(agentId).length>8||files.some(f=>f.size>20*1024*1024)||files.reduce((n,f)=>n+f.size,0)>40*1024*1024)throw Error('最多 8 个附件；单个 20 MB，总计 40 MB');const rows=await Promise.all(files.map(f=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:f.name,mime:f.type,base64:String(reader.result).split(',')[1]});reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(f);})));const added=await window.companion.call('quick-files',{agentId,files:rows});drafts.set(agentId,[...get(agentId),...added]);render();onChange();}catch(e){onError(e.message||'文件导入失败');}finally{importing=false;}
 });
 return {get,render,clear(id){drafts.delete(id);render();onChange();}};
}
