import React,{useRef,useState} from 'react';
import {Camera,ImagePlus,LoaderCircle} from 'lucide-react';
import {Modal,UserAvatar} from './Common.jsx';

async function prepareAvatar(file){
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片。');
 if(file.size>10*1024*1024)throw new Error('头像图片请小于 10 MB。');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败，请重新选择。'));reader.readAsDataURL(file);});
 const img=await new Promise((resolve,reject)=>{const image=new window.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('这张图片无法打开，请换一张。'));image.src=data;});
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const edge=Math.min(img.naturalWidth,img.naturalHeight);canvas.getContext('2d').drawImage(img,(img.naturalWidth-edge)/2,(img.naturalHeight-edge)/2,edge,edge,0,0,256,256);
 const url=canvas.toDataURL('image/png');return {url,data:{name:'avatar.png',mime:'image/png',base64:url.split(',')[1]}};
}
export default function ProfilePanel({profile={},call,onClose}){
 const [name,setName]=useState(profile.displayName||'你'),[avatar,setAvatar]=useState(profile.avatarUrl||''),[avatarData,setAvatarData]=useState(null),[removed,setRemoved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const input=useRef(null);
 const choose=async file=>{if(!file)return;setBusy(true);setError('');try{const prepared=await prepareAvatar(file);setAvatar(prepared.url);setAvatarData(prepared.data);setRemoved(false);}catch(e){setError(e.message);}finally{setBusy(false);if(input.current)input.current.value='';}};
 const save=async()=>{setBusy(true);setError('');try{await call('updateProfile',{displayName:name.trim()||'你',...(avatarData?{avatarData}:{}),...(removed?{removeAvatar:true}:{})});onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Modal title="个人资料" onClose={onClose} footer={<><button className="button" onClick={onClose}>取消</button><button className="button primary" disabled={busy} onClick={save}>{busy?<><LoaderCircle size={14} className="spin"/> 保存中…</>:'保存'}</button></>}>
  <div className="profile-edit"><button className="profile-photo-choice" type="button" aria-label="选择头像图片" onClick={()=>input.current?.click()} disabled={busy}><UserAvatar profile={{displayName:name,avatarUrl:avatar}}/><span><Camera size={16}/></span></button><div><h3>设置你的头像</h3><p>头像会显示在个人资料和你发送的消息旁。</p><button className="text-button" onClick={()=>input.current?.click()} disabled={busy}><ImagePlus size={14}/>选择图片</button>{avatar&&<button className="text-button" onClick={()=>{setAvatar('');setAvatarData(null);setRemoved(true);}} disabled={busy}>使用默认头像</button>}</div></div>
  <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="visually-hidden" aria-label="头像文件" onChange={e=>choose(e.target.files?.[0])}/>
  <label className="profile-name">显示名称<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder="输入你的名字"/></label>
  <p className="field-hint">图片会居中裁为正方形，保存在这台电脑。</p>{error&&<p className="setup-error" role="alert">{error}</p>}
 </Modal>;
}
