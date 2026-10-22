import PriceSettings from './PriceSettings.jsx';
import React,{useEffect,useState} from 'react';
import {BarChart3,RefreshCw} from 'lucide-react';
import {Avatar} from '../../components/Common.jsx';
import './usage.css';
const money=rows=>rows?.length?rows.map(v=>v.currency+' '+Number(v.amount).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6})).join(' · '):'待计价';
const n=value=>Number(value||0).toLocaleString('zh-CN');
export default function UsageWorkspace({state,call}){
 const [prices,setPrices]=useState(false);
 const [data,setData]=useState(null),[days,setDays]=useState(90),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async(sync=false)=>{setBusy(true);setError('');try{setData(await call(sync?'syncUsage':'getUsage',{days}));}catch(e){setError(e.message);}finally{setBusy(false);}};
 useEffect(()=>{load();},[days]);
 const max=Math.max(1,...(data?.agents||[]).map(a=>a.total)),map=new Map((data?.daily||[]).map(d=>[d.date,d]));
 const dates=Array.from({length:days},(_,i)=>{const d=new Date();d.setDate(d.getDate()-days+i+1);return d.toLocaleDateString('sv-SE');});
 return <section className="usage-workspace"><header className="module-heading"><div><h1>用量</h1><p>查看每位助手的实际调用记录和平台返回的 Token 用量。</p></div><button className="button" onClick={()=>setPrices(true)}>设置单价</button><button className="button" disabled={busy} onClick={()=>load(true)}><RefreshCw size={15} className={busy?'spin':''}/>同步平台</button></header>{error&&<p role="alert" className="video-error">{error}</p>}
 <div className="usage-period">{[7,30,90,365].map(d=><button key={d} className={days===d?'selected':''} onClick={()=>setDays(d)}>近 {d} 天</button>)}</div>
 <div className="usage-summary"><article><small>Token 总量</small><strong>{n(data?.total)}</strong></article><article><small>调用次数</small><strong>{n(data?.requests)}</strong></article><article><small>估算费用</small><strong>{data?.requests?money(data?.costs):'USD 0.00'}</strong></article><article><small>未返回用量的调用</small><strong>{n(data?.unknown)}</strong></article></div>
 <section className="usage-section"><h2><BarChart3 size={17}/>助手用量</h2><div className="usage-bars">{(data?.agents||[]).map(a=><article key={a.id}><Avatar agent={state.agents.find(v=>v.id===a.id)} size="small"/><div><div className="usage-bar-caption"><strong>{a.name}</strong><span>{n(a.total)} Token · {n(a.requests)} 次 · {money(a.costs)}</span></div><div className="usage-track"><i style={{width:`${a.total/max*100}%`}}/></div><small>输入 {n(a.input)} · 输出 {n(a.output)}{a.unknown?` · ${a.unknown} 次用量未知`:''}</small></div></article>)}</div></section>
 <section className="usage-section"><h2>调用热力图</h2><div className="usage-heatmap">{dates.map(date=>{const value=map.get(date)?.total||0;return <i key={date} title={`${date} · ${n(value)} Token`} style={{'--heat':value?Math.min(1,.2+Math.log10(value+1)/6):0}}/>;})}</div><p className="field-hint">按本机返回的用量统计；灰格代表当天未记录到 Token。</p></section>
 <p className="field-hint">金额按当前公开参考价或自定义单价估算，历史记录按当前单价重算；{data?.unpriced||0} 次缺少价格，{data?.unknown||0} 次未返回 Token。图片、工具费用及账号折扣以平台账单为准。GPT 长上下文、DeepSeek 中转分时价格按已公开条件计算；官方 DeepSeek 按高峰价估算。</p>
 <section className="usage-section"><h2>平台同步</h2>{Object.entries(data?.balances?.providers||{}).map(([id,v])=><div className="usage-balance" key={id}><strong>{state.providers[id]?.name||id}</strong><span>{v.status==='synced'?v.balances.map(b=>`${b.total} ${b.currency}`).join(' · '):v.message}</span></div>)}<p className="field-hint">{data?.balances?.updatedAt?`最近同步：${new Date(data.balances.updatedAt).toLocaleString('zh-CN')}。`:''}Agent 图表来自本机调用响应，平台余额是账户级信息。API 未返回的费用和 Token 保持未知。</p></section>{prices&&<PriceSettings state={state} call={call} onClose={()=>setPrices(false)} onSaved={()=>load()}/>}</section>;
}
