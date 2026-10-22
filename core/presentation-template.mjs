import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
const NS={p:'http://schemas.openxmlformats.org/presentationml/2006/main',a:'http://schemas.openxmlformats.org/drawingml/2006/main',r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships'};
function parse(xml){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('模板不支持外部实体');const errors=[];const doc=new DOMParser({errorHandler:{warning:()=>{},error:e=>errors.push(e),fatalError:e=>errors.push(e)}}).parseFromString(xml,'application/xml');if(errors.length)throw Error('模板 XML 结构无效');return doc;}
const nodes=(root,ns,name)=>Array.from(root.getElementsByTagNameNS(ns,name));
async function load(buffer){
 if(buffer.length>20*1024*1024)throw Error('模板最多 20 MB');const zip=await JSZip.loadAsync(buffer);let total=0;
 for(const entry of Object.values(zip.files)){total+=entry._data?.uncompressedSize||0;if(entry.name.includes('..')||entry.unsafeOriginalName&&entry.unsafeOriginalName!==entry.name||!entry.dir&&(/vbaProject|activeX\//i.test(entry.name)||/embeddings\//i.test(entry.name)&&!entry.name.endsWith('.xlsx')))throw Error('请选择不含宏、嵌入程序的 PPTX 模板');}
 if(total>80*1024*1024||Object.keys(zip.files).length>5000)throw Error('模板展开后过大');
 const presentation=zip.file('ppt/presentation.xml'),rels=zip.file('ppt/_rels/presentation.xml.rels');if(!presentation||!rels)throw Error('请选择完整的 PPTX 模板');
 const relationships=Array.from(parse(await rels.async('string')).documentElement.childNodes).filter(n=>n.nodeType===1),targets=new Map(relationships.map(r=>[r.getAttribute('Id'),r]));
 const slides=nodes(parse(await presentation.async('string')),NS.p,'sldId').map(n=>{const r=targets.get(n.getAttributeNS(NS.r,'id')),target=r?.getAttribute('Target');if(!target||r.getAttribute('TargetMode')==='External')throw Error('模板页面引用无效');const name=target.startsWith('/')?target.slice(1):'ppt/'+target;if(!/^ppt\/slides\/slide[0-9]+\.xml$/.test(name)||!zip.file(name))throw Error('模板页面路径无效');return name;});
 if(!slides.length||slides.length>30)throw Error('模板需要 1 至 30 页');return {zip,slides};
}
function shapes(doc){return nodes(doc,NS.p,'sp').map((shape,index)=>({index,shape,text:nodes(shape,NS.a,'t').map(n=>n.textContent).join(''),placeholder:nodes(shape,NS.p,'ph')[0]?.getAttribute('type')})).filter(s=>s.text.trim());}
function slots(items){
 const title=items.find(s=>s.text.includes('{{title}}'))||items.find(s=>['title','ctrTitle'].includes(s.placeholder))||items[0];
 const body=items.find(s=>s!==title&&/\{\{(?:body|subtitle)\}\}/.test(s.text))||items.filter(s=>s!==title&&!['dt','ftr','sldNum'].includes(s.placeholder)).sort((a,b)=>b.text.length-a.text.length)[0];
 return {title,body};
}
export async function inspectPresentationTemplate(buffer){
 const {zip,slides}=await load(buffer),pages=[];
 for(const name of slides){const items=shapes(parse(await zip.file(name).async('string'))),{title,body}=slots(items);if(!title)throw Error('模板每页需要至少一个文字框');const editable=items.filter(s=>!['dt','ftr','sldNum'].includes(s.placeholder));if(editable.length>60)throw Error('模板每页最多60个文字框');pages.push({title:title.text.slice(0,200),body:body?.text.slice(0,700)||'',hasBody:!!body,texts:editable.map(s=>({id:s.index,text:s.text.slice(0,500)}))});}
 return {pageCount:pages.length,pages};
}
/** 只替换选定文字框，保留原文件的母版、版式、主题、图片和其他页面元素。 */
export async function fillPresentationTemplate(buffer,deck){
 const {zip,slides}=await load(buffer);if(deck.slides.length!==slides.length)throw Error(`所选模板为 ${slides.length} 页，请按模板页数重新生成`);
 const serializer=new XMLSerializer();
 for(let i=0;i<slides.length;i++){
  const name=slides[i],original=await zip.file(name).async('string'),doc=parse(original),{title,body}=slots(shapes(doc)),page=deck.slides[i];
  const bodyText=[page.subtitle,...(page.bullets||[]),...(page.columns||[]).flatMap(c=>[c.title,...c.bullets]),page.quote,page.attribution].filter(Boolean).join('\n');
  const replace=(slot,value)=>{if(!slot)return;const text=nodes(slot.shape,NS.a,'t');text.forEach((n,index)=>{n.textContent=index===0?value:'';});};
  if(page.texts){
   const editable=shapes(doc).filter(s=>!['dt','ftr','sldNum'].includes(s.placeholder));
   if(page.texts.length!==editable.length||new Set(page.texts.map(t=>t.id)).size!==editable.length||page.texts.some(t=>!editable.some(s=>s.index===t.id)))throw Error(`模板第 ${i+1} 页文字框未完整匹配，请重新生成`);
   for(const value of page.texts)replace(editable.find(s=>s.index===value.id),value.text);
  }else{replace(title,page.title);if(body)replace(body,bodyText);else if(bodyText)throw Error(`模板第 ${i+1} 页没有正文框，请为该页补充正文框或只生成标题`);}
  zip.file(name,serializer.serializeToString(doc));
 }
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
