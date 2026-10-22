import JSZip from 'jszip';
import path from 'node:path';

export function validateOfficeContainer(buffer){
  const footer=buffer.lastIndexOf(Buffer.from([80,75,5,6]));
  if(footer<0||footer+22>buffer.length)throw new Error('文档压缩容器不完整');
  const count=buffer.readUInt16LE(footer+10),start=buffer.readUInt32LE(footer+16);let offset=start,total=0;
  if(count>10000||count===65535||start===0xffffffff)throw new Error('文档结构过大，请拆分后上传');
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('文档压缩目录无效');
    const size=buffer.readUInt32LE(offset+24);total+=size;
    if(size>32*1024*1024||total>64*1024*1024)throw new Error('文档展开后过大，请拆分后上传');
    offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
}
const decode=text=>text.replace(/&#(x[0-9a-f]+|\d+);|&(lt|gt|amp|quot|apos);/gi,(all,num,key)=>{
  if(num){const n=num[0].toLowerCase()==='x'?parseInt(num.slice(1),16):Number(num);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
  return {lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[key.toLowerCase()];
});
const textNodes=xml=>[...xml.matchAll(/<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/g)].map(m=>decode(m[1])).join('');
export async function extractOfficeText(buffer,ext){
  validateOfficeContainer(buffer);
  const zip=await JSZip.loadAsync(buffer);
  const read=async name=>zip.file(name)?zip.file(name).async('string'):'';
  const relations=xml=>new Map([...xml.matchAll(/<Relationship\s+([^>]+)\/?\s*>/g)].filter(m=>! /TargetMode="External"/.test(m[1])).map(m=>[m[1].match(/\bId="([^"]+)"/)?.[1],m[1].match(/\bTarget="([^"]+)"/)?.[1]]));
  if(ext==='.pptx'){
    const rels=relations(await read('ppt/_rels/presentation.xml.rels'));
    const names=[...(await read('ppt/presentation.xml')).matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"[^>]*\/?\s*>/g)].map(m=>rels.get(m[1])).filter(Boolean).map(target=>path.posix.normalize(target.startsWith('/')?target.slice(1):'ppt/'+target)).filter(name=>name.startsWith('ppt/slides/')&&zip.file(name));
    if(!names.length)throw new Error('演示文稿没有可读取的幻灯片');
    const result=[];for(const [i,name]of names.entries()){const xml=await read(name);result.push(`第 ${i+1} 页\n`+xml.split(/<\/a:p>/).map(textNodes).filter(Boolean).join('\n'));}
    return result.join('\n\n');
  }
  if(ext==='.xlsx'){
    const shared=[...(await read('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>textNodes(m[1]));
    const rels=relations(await read('xl/_rels/workbook.xml.rels'));
    const sheets=[...(await read('xl/workbook.xml')).matchAll(/<sheet\b([^>]+)\/?\s*>/g)].map(m=>({name:decode(m[1].match(/\bname="([^"]+)"/)?.[1]??''),target:rels.get(m[1].match(/\br:id="([^"]+)"/)?.[1])})).filter(s=>s.target);
    const names=sheets.map(s=>path.posix.normalize(s.target.startsWith('/')?s.target.slice(1):'xl/'+s.target));
    if(!names.length)throw new Error('表格没有可读取的工作表');
    const result=[];for(const [index,name]of names.entries()){
      const xml=await read(name),lines=[];
      for(const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
        const cells=[...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{
          const value=c[2].match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]??'';
          const out=/\bt="s"/.test(c[1])?(shared[Number(value)]??''):/\bt="inlineStr"/.test(c[1])?textNodes(c[2]):decode(value);
          return `${c[1].match(/\br="([^"]+)"/)?.[1]??''}: ${out}`;
        });if(cells.length)lines.push(cells.join(' | '));if(lines.join('').length>80000)break;
      }
      result.push(`工作表 ${sheets[index].name||index+1}\n${lines.join('\n')}`);
    }return result.join('\n\n');
  }
  const xml=await read('content.xml');if(!xml)throw new Error('文档内容不存在');
  return decode(xml.replace(/<\/(?:text:p|text:h|table:table-row)>/g,'\n').replace(/<[^>]+>/g,'')).trim();
}
