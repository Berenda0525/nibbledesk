import React,{Children,isValidElement,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';

const textOf=value=>Children.toArray(value).map(child=>isValidElement(child)?textOf(child.props.children):String(child)).join('');

export default function Dropdown({children,value,onChange,disabled=false,className='',id,title,'aria-label':label,...props}){
 const options=Children.toArray(children).filter(isValidElement).map(child=>({value:String(child.props.value??textOf(child.props.children)),label:textOf(child.props.children),disabled:!!child.props.disabled}));
 const selected=options.findIndex(option=>option.value===String(value??''));
 const trigger=useRef(null),menu=useRef(null),search=useRef({text:'',time:0});
 const menuId=useId(),[open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState(null),[portal,setPortal]=useState(null);
 const first=()=>Math.max(0,options.findIndex(option=>!option.disabled));
 const close=()=>setOpen(false);
 const show=()=>{if(disabled||!options.some(option=>!option.disabled))return;setPortal(trigger.current.closest('dialog')||document.body);setActive(selected>=0&&!options[selected].disabled?selected:first());setOpen(true);};
 const choose=index=>{const option=options[index];if(!option||option.disabled)return;onChange?.({target:{value:option.value},currentTarget:{value:option.value}});close();trigger.current?.focus({preventScroll:true});};
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const rect=trigger.current.getBoundingClientRect(),topLimit=44,gap=6,bottomSpace=innerHeight-rect.bottom-12,topSpace=rect.top-topLimit-gap,above=bottomSpace<160&&topSpace>bottomSpace;const maxHeight=Math.max(80,Math.min(296,above?topSpace:bottomSpace)),width=Math.min(Math.max(rect.width,180),innerWidth-24);setPosition({left:Math.max(12,Math.min(rect.left,innerWidth-width-12)),width,maxHeight,...above?{bottom:innerHeight-rect.top+gap}:{top:Math.max(topLimit,rect.bottom+gap)}});};
  place();window.addEventListener('resize',place);const onScroll=event=>{if(!menu.current?.contains(event.target))close();};window.addEventListener('scroll',onScroll,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',onScroll,true);};
 },[open]);
 useEffect(()=>{if(open)menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[open,active,position]);
 useEffect(()=>{if(disabled)close();},[disabled]);
 useEffect(()=>{if(!open)return;const outside=event=>{if(!trigger.current?.contains(event.target)&&!menu.current?.contains(event.target))close();};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[open]);
 const move=step=>{let next=active;for(let count=0;count<options.length;count++){next=(next+step+options.length)%options.length;if(!options[next].disabled){setActive(next);return;}}};
 const keyDown=event=>{
  if(disabled)return;
  if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key==='Tab'){close();return;}
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
   event.preventDefault();event.stopPropagation();
   if(!open){show();if(event.key==='Home')setActive(first());else if(event.key==='End')setActive(options.findLastIndex(option=>!option.disabled));return;}
   if(event.key==='ArrowDown')move(1);else if(event.key==='ArrowUp')move(-1);else if(event.key==='Home')setActive(first());else if(event.key==='End')setActive(options.findLastIndex(option=>!option.disabled));else choose(active);
   return;
  }
  if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();const now=Date.now();search.current={text:now-search.current.time>700?event.key:search.current.text+event.key,time:now};const query=search.current.text.toLocaleLowerCase();const index=options.findIndex(option=>!option.disabled&&option.label.toLocaleLowerCase().startsWith(query));if(index>=0){if(!open)show();setActive(index);}}
 };
 return <span className={`dropdown ${className}`}><button {...props} id={id} ref={trigger} type="button" role="combobox" className="dropdown-trigger" title={title||options[selected]?.label} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?menuId:undefined} aria-activedescendant={open?`${menuId}-${active}`:undefined} disabled={disabled} onClick={()=>open?close():show()} onKeyDown={keyDown} onBlur={event=>{if(!menu.current?.contains(event.relatedTarget))close();}}><span>{options[selected]?.label||options[0]?.label||'请选择'}</span><ChevronDown size={14} aria-hidden="true"/></button>{open&&position&&portal&&createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={label||'可选项'} className="dropdown-menu" style={position}>{options.map((option,index)=><div key={`${option.value}-${index}`} id={`${menuId}-${index}`} role="option" aria-selected={index===selected} aria-disabled={option.disabled||undefined} data-index={index} className={`dropdown-option ${active===index?'highlighted':''} ${index===selected?'selected':''}`} title={option.label} onPointerMove={()=>!option.disabled&&setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(index)}><span>{option.label}</span>{index===selected&&<Check size={14} aria-hidden="true"/>}</div>)}</div>,portal)}</span>;
}
