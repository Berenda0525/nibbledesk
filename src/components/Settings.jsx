import ProviderServices from '../modules/providers/ProviderServices.jsx';
import Dropdown from './Dropdown.jsx';
import React,{useState} from 'react';
import {KeyRound,Plus,ChevronDown,Server} from 'lucide-react';
import {Modal,providerName} from './Common.jsx';
import DesktopSettings from './DesktopSettings.jsx';

export default function Settings({state,call,onClose,notify,initialTab='providers'}){
 const [tab,setTab]=useState(initialTab),[working,setWorking]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const [custom,setCustom]=useState({provider:'apimart',id:'',name:'',family:'',kind:'chat'});
 const run=async(id,work)=>{setWorking(id);try{await work();}catch{}finally{setWorking('');}};
 const list=state.models.filter(m=>(filter==='all'||m.provider===filter)&&(m.id+' '+m.name+' '+m.family).toLowerCase().includes(query.toLowerCase()));
 return <Modal title="设置" onClose={onClose} wide>
  <div className="settings-tabs"><button className={tab==='providers'?'active':''} onClick={()=>setTab('providers')}><KeyRound size={16}/>模型服务</button><button className={tab==='catalog'?'active':''} onClick={()=>setTab('catalog')}><Server size={16}/>模型目录 <small>{state.models.length}</small></button><button className={tab==='desktop'?'active':''} onClick={()=>setTab('desktop')}>桌面与语音</button></div>
  {tab==='providers'?<ProviderServices state={state} call={call} notify={notify}/>:tab==='desktop'?<DesktopSettings state={state} call={call} notify={notify}/>:<div className="catalog-settings">
   <div className="catalog-toolbar"><input aria-label="搜索模型" placeholder="搜索名称或模型 ID" value={query} onChange={e=>setQuery(e.target.value)}/><Dropdown aria-label="平台筛选" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部平台</option>{Object.entries(state.providers).map(([id,p])=><option key={id} value={id}>{p.name||providerName(id)}</option>)}</Dropdown></div>
   <div className="catalog-table"><div className="catalog-row catalog-head"><span>模型名称 / ID</span><span>类型</span><span>服务平台</span></div>{list.length?list.map(m=><div className="catalog-row" key={m.provider+':'+m.id}><span><strong>{m.name||m.id}</strong>{m.name&&m.name!==m.id&&<code>{m.id}</code>}</span><span className="kind-chip">{m.kind==='image'?'图像':'对话'}</span><span>{providerName(m.provider,state.providers)}</span></div>):<p className="catalog-none">没有符合条件的模型。</p>}</div>
   <details className="custom-model"><summary><Plus size={16}/>添加模型或推理接入点<ChevronDown size={15}/></summary><form onSubmit={async e=>{e.preventDefault();await run('add',async()=>{await call('addModel',custom);setCustom(c=>({...c,id:'',name:''}));notify('已添加，可在 Agent 中选择。');});}}>
    <div className="form-grid"><label>服务平台<Dropdown aria-label="服务平台" value={custom.provider} onChange={e=>setCustom(c=>({...c,provider:e.target.value}))}>{Object.entries(state.providers).map(([id,p])=><option key={id} value={id}>{p.name||providerName(id)}</option>)}</Dropdown></label><label>模型类型<Dropdown aria-label="模型类型" value={custom.kind} onChange={e=>setCustom(c=>({...c,kind:e.target.value}))}><option value="chat">对话</option><option value="image">图像生成</option></Dropdown></label><label>模型 ID<input required value={custom.id} placeholder="平台提供的精确 ID" onChange={e=>setCustom(c=>({...c,id:e.target.value}))}/></label><label>显示名称<input value={custom.name} placeholder="可选" onChange={e=>setCustom(c=>({...c,name:e.target.value}))}/></label><label>所属系列<Dropdown aria-label="所属系列" value={custom.family} onChange={e=>setCustom(c=>({...c,family:e.target.value}))}><option value="">自动识别</option>{['claude','gpt','gemini','deepseek','kimi','doubao'].map(v=><option key={v}>{v}</option>)}</Dropdown></label><div className="form-bottom"><button disabled={!!working||!custom.id.trim()} className="button primary" type="submit">添加模型</button></div></div>
   </form></details>
   <p className="field-hint">模型目录不代表当前账号已开通全部模型；可用性与额度由平台决定。</p>
  </div>}
  <div className="settings-version">版本 {state.version}</div>
 </Modal>;
}
