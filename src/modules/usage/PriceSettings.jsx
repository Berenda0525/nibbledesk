import React,{useState} from 'react';
import {Modal} from '../../components/Common.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import {priceFor} from '../../../core/pricing.mjs';
export default function PriceSettings({state,call,onClose,onSaved}){
 const models=state.models.filter(m=>m.kind==='chat'),first=state.agents[0],initial=models.find(m=>m.provider===first?.provider&&m.id===first?.model)||models[0];
 const key=m=>m.provider+'|'+m.id,fields=[['input','输入'],['output','输出'],['cache','缓存读取'],['write5','缓存写入 / 5 分钟'],['writeHour','缓存写入 / 1 小时']];
 const [selected,setSelected]=useState(key(initial)),[draft,setDraft]=useState(()=>({...priceFor(initial.provider,initial.id,state,state.providers)})),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const model=models.find(m=>key(m)===selected),save=async(reset=false)=>{setBusy(true);setError('');try{await call('saveModelPrice',{...draft,provider:model.provider,model:model.id,reset});await onSaved();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Modal title="模型计费单价" onClose={onClose} footer={<><button className="text-button" disabled={busy} onClick={()=>save(true)}>恢复参考价</button><button className="button" onClick={onClose}>取消</button><button className="button primary" disabled={busy} onClick={()=>save()}>保存单价</button></>}>
  <p className="field-hint">每 100 万 Token 的价格。可填写你在中转平台实际使用的档位，USD 与 CNY 分开汇总。</p><div className="form-grid"><label className="full-width">模型<Dropdown aria-label="计价模型" value={selected} onChange={e=>{const m=models.find(m=>key(m)===e.target.value);setSelected(e.target.value);setDraft({...priceFor(m.provider,m.id,state,state.providers)});}}>{models.map(m=><option key={key(m)} value={key(m)}>{state.providers[m.provider]?.name||m.provider} · {m.name||m.id}</option>)}</Dropdown></label><label>币种<Dropdown aria-label="计价币种" value={draft.currency||'USD'} onChange={e=>setDraft(d=>({...d,currency:e.target.value}))}><option value="USD">USD · 美元</option><option value="CNY">CNY · 人民币</option></Dropdown></label>{fields.map(([id,label])=><label key={id}>{label}<input aria-label={label+'单价'} type="number" min="0" max="1000000" step="any" value={draft[id]??''} onChange={e=>setDraft(d=>({...d,[id]:e.target.value}))} placeholder={id==='input'||id==='output'?'请填写':'按普通输入价估算'}/></label>)}</div>
  <p className="field-hint">{draft.basis||'此模型暂无已核实的参考价'}{draft.checkedAt?' · '+draft.checkedAt:''}。自定义单价按固定价计算，替代公开参考价的时段与长上下文规则。历史估算随当前单价重新计算。</p>{error&&<p role="alert" className="video-error">{error}</p>}
 </Modal>;
}
