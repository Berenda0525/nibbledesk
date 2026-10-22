import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {writeAtomic} from '../core/atomic-file.mjs';
import {validateFileScope} from './file-store.mjs';

const kinds={'.docx':'word','.doc':'word','.odt':'word','.xlsx':'sheet','.xls':'sheet','.ods':'sheet','.pptx':'presentation','.ppt':'presentation','.odp':'presentation'};
const nameOf=value=>path.basename(String(value||'未命名').replaceAll('\\','/')).replace(/[\u0000-\u001f<>:"|?*]/g,'_').slice(0,100)||'未命名';
export function createDocumentManager({files,office,dataDir,onSaved=()=>{}}){
  const previewRoot=dataDir?path.join(dataDir,'cache','document-previews'):null;
  const cacheKey=async id=>createHash('sha256').update('office-preview-v1\0').update(await files.readBuffer(id)).digest('hex');
  async function open({id}){
    const asset=await files.get(id);if(!asset)throw new Error('文件不存在');
    const ext=path.extname(asset.name).toLowerCase(),base={id:asset.id,name:asset.name,revision:asset.revision??1,scope:asset.scope,notes:asset.notes??[],notesRevision:asset.notesRevision??0};
    if(kinds[ext]){
      const previewKey=previewRoot?await cacheKey(id):null;
      if(previewKey){try{const pdf=await fs.readFile(path.join(previewRoot,previewKey+'.pdf'));if(pdf.subarray(0,5).toString()==='%PDF-')return {...base,kind:kinds[ext],editable:false,previewKey,previewSource:'cache',base64:pdf.toString('base64')};}catch(e){if(e.code!=='ENOENT')throw e;}}
      return {...base,kind:kinds[ext],editable:true,previewKey,session:await office.openSession({assetId:id})};
    }
    if(asset.type==='image')return {...base,kind:'image',url:asset.url,editable:false};
    if(ext==='.pdf')return {...base,kind:'pdf',base64:(await files.readBuffer(id)).toString('base64'),editable:false};
    if(typeof asset.text!=='string')return {...base,kind:'binary',editable:false};
    const buffer=await files.readBuffer(id);
    const content=buffer[0]===255&&buffer[1]===254?buffer.subarray(2).toString('utf16le'):buffer.toString('utf8').replace(/^\uFEFF/,'');
    return {...base,kind:['.md','.markdown'].includes(ext)?'markdown':'text',content,editable:true};
  }
  return {
    open,
    async cachePreview({id,previewKey,base64}){
      if(!previewRoot)return {cached:false};
      const asset=await files.get(id);if(!asset||!kinds[path.extname(asset.name).toLowerCase()])throw new Error('预览文件无效');
      if(typeof previewKey!=='string'||!/^[a-f0-9]{64}$/.test(previewKey)||typeof base64!=='string'||base64.length>28*1024*1024)throw new Error('预览数据无效');
      const pdf=Buffer.from(base64,'base64');if(pdf.length>20*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-'||!pdf.subarray(-2048).includes(Buffer.from('%%EOF')))throw new Error('预览不是完整 PDF');
      if(previewKey!==await cacheKey(id))throw new Error('文件已更新，请重新生成预览');
      await fs.mkdir(previewRoot,{recursive:true});await writeAtomic(path.join(previewRoot,previewKey+'.pdf'),pdf);
      return {cached:true};
    },
    async create({kind,name,scope}){
      scope=validateFileScope(scope);if(!scope)throw new Error('请选择助手或群聊文件夹');
      const extension={word:'.docx',sheet:'.xlsx',presentation:'.pptx',markdown:'.md'}[kind];
      if(!extension)throw new Error('请选择 Word、Excel、PPT 或 Markdown 文档');
      name=nameOf(name||({word:'未命名文档',sheet:'未命名表格',presentation:'未命名演示',markdown:'未命名笔记'})[kind]);
      if(!name.toLowerCase().endsWith(extension))name+=extension;
      if(kind==='markdown'){
        const asset=await files.createDocument({name,scope,buffer:Buffer.from('# '+name.slice(0,-3)+'\n\n')});await onSaved(asset);return open({id:asset.id});
      }
      return {name,kind,editable:true,scope,session:await office.openSession({kind:extension.slice(1),name,scope})};
    },
    async save({id,content,revision}){
      const asset=await files.get(id);if(!asset)throw new Error('文件不存在');
      const ext=path.extname(asset.name).toLowerCase();
      if(kinds[ext])throw new Error('请使用文档编辑器中的保存按钮保存此文件。');
      if(asset.type==='image'||ext==='.pdf'||typeof asset.text!=='string')throw new Error('该文件不支持文本编辑，请使用对应编辑器或下载保存。');
      if(typeof content!=='string'||content.length>8*1024*1024)throw new Error('文本内容为空或超过编辑上限');
      const updated=await files.updateDocument(id,{buffer:Buffer.from(content||'\n','utf8'),revision});await onSaved(updated);return open({id});
    }
  };
}
