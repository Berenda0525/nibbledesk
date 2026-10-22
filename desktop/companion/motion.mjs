// 与参考动效相同的弹簧参数；状态反转时保留速度，动画期间保持窗口与内容尺寸稳定。
const STIFFNESS=400,DAMPING=30;
export function advanceSpring({position,velocity},target,seconds){
  const t=Math.max(0,Math.min(seconds,.064)),decay=DAMPING/2;
  const frequency=Math.sqrt(STIFFNESS-decay*decay),offset=position-target;
  const b=(velocity+decay*offset)/frequency,envelope=Math.exp(-decay*t);
  const wave=offset*Math.cos(frequency*t)+b*Math.sin(frequency*t);
  return {position:target+envelope*wave,velocity:envelope*((-offset*frequency*Math.sin(frequency*t)+b*frequency*Math.cos(frequency*t))-decay*wave)};
}

export function createIslandMotion({paint,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,reducedMotion=false}){
  let state={position:0,velocity:0},target=0,frame=null,previous=null,reduced=reducedMotion,disposed=false;
  const cancel=()=>{if(frame!==null)cancelFrame(frame);frame=null;previous=null;};
  function tick(time){
    frame=null;
    if(previous!==null)state=advanceSpring(state,target,(time-previous)/1000);
    previous=time;
    const settled=Math.abs(state.position-target)<.0001&&Math.abs(state.velocity)<.005;
    if(settled)state={position:target,velocity:0};
    paint(state.position);
    if(!settled)frame=requestFrame(tick);else previous=null;
  }
  paint(0);
  return {
    setExpanded(expanded){
      if(disposed)return;
      target=expanded?1:0;
      if(reduced){cancel();state={position:target,velocity:0};paint(target);}
      else if(frame===null&&(state.position!==target||state.velocity!==0))frame=requestFrame(tick);
    },
    setReducedMotion(value){
      if(disposed)return;
      reduced=!!value;
      if(reduced){cancel();state={position:target,velocity:0};paint(target);}
    },
    refresh(){if(!disposed)paint(state.position);},
    dispose(){disposed=true;cancel();},
  };
}

export function islandFrame(progress,width,height){
  const p=Math.max(0,Math.min(1,progress)),inset=(width-176)*(1-p)/2,bottom=(height-32)*(1-p);
  return {
    clipPath:`inset(0px ${inset}px ${bottom}px round 0px 0px ${18+8*p}px ${18+8*p}px)`,
    panelOpacity:Math.max(0,Math.min(1,(p-.22)/.58)),
    panelTransform:`translateY(${-8*(1-p)}px) scale(${.985+.015*p})`,
    compactOpacity:Math.max(0,1-p/.2),
    compactTransform:`translateX(-50%) translateY(${-5*p}px)`,
  };
}
