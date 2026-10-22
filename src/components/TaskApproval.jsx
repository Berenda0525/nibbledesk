import React,{useState} from 'react';
import {Terminal,ShieldCheck} from 'lucide-react';
import {Modal} from './Common.jsx';

export default function TaskApproval({request,agents,onResolve}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const resolve=async approved=>{setBusy(true);try{await onResolve(request.id,approved);}catch(e){setError(e.message||'未能提交决定，请重试。');}finally{setBusy(false);}};
 const source=request.sourcePreview&&<details className="approval-source"><summary>查看待运行代码</summary><pre>{String(request.sourcePreview).slice(0,16000)}</pre>{request.codeHash&&<small>代码校验值 <code>{request.codeHash}</code></small>}</details>;
 return <Modal title="确认这次任务操作" onClose={()=>{if(!busy)resolve(false);}} footer={<><button className="button" disabled={busy} onClick={()=>resolve(false)}>拒绝</button><button className="button primary" disabled={busy} onClick={()=>resolve(true)}><ShieldCheck size={15}/>批准一次</button></>}><div className="approval-intro"><Terminal size={21}/><p>{agents.find(a=>a.id===request.agentId)?.name||'当前助手'} 请求执行以下操作。</p></div><dl className="approval-details"><dt>执行命令</dt><dd><pre>{request.command}</pre></dd><dt>工作目录</dt><dd><code>{request.cwd}</code></dd><dt>用途</dt><dd>{request.reason||'由当前任务提出的本机操作。'}</dd></dl>{source}{!source&&request.codeHash&&<p className="field-hint">代码校验值 <code>{request.codeHash}</code></p>}<p className="field-hint">仅批准此处展示的这一次操作。</p>{error&&<p className="inline-error">{error}</p>}</Modal>;
}
