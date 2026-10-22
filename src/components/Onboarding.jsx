import Dropdown from './Dropdown.jsx';
import React,{useState} from 'react';
import {KeyRound,ArrowRight,Check,Eye,EyeOff,LoaderCircle} from 'lucide-react';

export default function Onboarding({call,onDone}){
 const [provider,setProvider]=useState('apimart'),[baseUrl,setBaseUrl]=useState('');
 const [step,setStep]=useState(1),[key,setKey]=useState(''),[volcano,setVolcano]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{setBusy(true);setError('');try{await call('saveProvider',{provider:step===1?(provider==='custom'?'custom-default':provider):'volcano',...(step===1&&provider==='custom'?{name:'自定义服务',baseUrl,api:'chat'}:{}),key:(step===1?key:volcano).trim()});if(step===1&&provider==='deepseek')await call('updateAgent',{id:'deepseek',provider:'deepseek',model:'deepseek-flash'});if(step===1){setKey('');setStep(2);setShow(false);}else onDone();}catch(e){setError(e.message||'保存失败，请重试。');}finally{setBusy(false);}};
 const value=step===1?key:volcano;
 return <main className="onboarding"><form className="onboarding-panel" onSubmit={e=>{e.preventDefault();save();}}>
  <div className="setup-progress"><span className={step===1?'current':'done'}>{step>1?<Check size={12}/>:'1'}</span><i/><span className={step===2?'current':''}>2</span></div>
  <h1>{step===1?(provider==='apimart'?'连接 APImart':provider==='deepseek'?'连接 DeepSeek 官方':'连接模型服务'):'添加火山方舟'}</h1>
  <p className="setup-intro">{step===1?(provider==='apimart'?'先填入 API Key，即可开始与 Claude、GPT、Gemini 等助手聊天。':'填写对应服务的 API Key，再为助手选择该服务和精确模型 ID。'):'想使用豆包和 Seedream 作图，可以再添加火山方舟。也可以稍后在设置中填写。'}</p>
  {step===1&&<><label>服务平台</label><Dropdown aria-label="首次配置服务" value={provider} onChange={e=>setProvider(e.target.value)}><option value="apimart">APImart</option><option value="deepseek">DeepSeek 官方</option><option value="custom">其他中转 / 官方兼容 API</option></Dropdown>{provider==='custom'&&<><label htmlFor="setup-url">服务地址</label><input id="setup-url" type="url" required value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1"/></>}</>}
  <label htmlFor="setup-key">{step===1?`${provider==='apimart'?'APImart':provider==='deepseek'?'DeepSeek 官方':'服务'} API Key`:'火山方舟 API Key'}{step===2&&<small>可选</small>}</label>
  <div className="setup-key-field"><KeyRound size={17}/><input id="setup-key" autoFocus type={show?'text':'password'} autoComplete="off" spellCheck="false" placeholder="粘贴 API Key" value={value} onChange={e=>step===1?setKey(e.target.value):setVolcano(e.target.value)}/><button type="button" aria-label={show?'隐藏密钥':'显示密钥'} onClick={()=>setShow(!show)}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>
  {error&&<p className="setup-error" role="alert">{error}</p>}
  <p className="setup-note">密钥加密保存在这台电脑。请确保平台账号已开通模型服务并有可用额度。</p>
  <button className="setup-next" type="submit" disabled={busy||!value.trim()}>{busy?<><LoaderCircle className="spin" size={16}/>保存中…</>:step===1?<>继续<ArrowRight size={16}/></>:'保存并进入聊天'}</button>
  {step===2&&<button className="setup-skip" type="button" onClick={onDone} disabled={busy}>跳过，进入聊天</button>}
 </form></main>;
}
