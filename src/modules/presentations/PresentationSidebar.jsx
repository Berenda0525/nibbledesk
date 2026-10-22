import React from 'react';
import {Presentation,LoaderCircle,AlertCircle} from 'lucide-react';
const labels={ready:'可编辑',generating:'制作中',error:'生成未完成',cancelled:'已停止'};
export default function PresentationSidebar({items,selectedId,query,onSelect}){
 const rows=items.filter(item=>!query||[item.title,item.asset?.name].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <div className="ppt-sidebar">{rows.map(item=><button key={item.id} className={`ppt-sidebar-item ${selectedId===item.id?'selected':''}`} onClick={()=>onSelect(item.id)}><span className="ppt-sidebar-icon">{item.status==='generating'?<LoaderCircle size={20} className="spin"/>:item.status==='error'?<AlertCircle size={20}/>:<Presentation size={20}/>}</span><span><strong>{item.title}</strong><small>{labels[item.status]}{item.previousId?' · 修改稿':''}</small></span></button>)}{!rows.length&&<div className="sidebar-empty">{query?'没有找到相关作品':'制作的 PPT 会出现在这里'}</div>}</div>;
}
