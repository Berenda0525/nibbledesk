import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSpring,createIslandMotion,islandFrame} from '../desktop/companion/motion.mjs';

function fixture(){
  let next=0;const callbacks=new Map(),painted=[];
  const motion=createIslandMotion({paint:p=>painted.push(p),requestFrame:fn=>{callbacks.set(++next,fn);return next;},cancelFrame:id=>callbacks.delete(id)});
  const frame=time=>{const batch=[...callbacks.values()];callbacks.clear();for(const fn of batch)fn(time);};
  return {motion,painted,callbacks,frame};
}
test('spring converges across frame rates and bounds delayed frames',()=>{
  for(const hz of [30,60,120]){
    let state={position:0,velocity:0};
    for(let i=0;i<hz;i++)state=advanceSpring(state,1,1/hz);
    assert.ok(Math.abs(state.position-1)<.00001);
    assert.ok(Math.abs(state.velocity)<.0001);
  }
  assert.deepEqual(advanceSpring({position:0,velocity:0},1,10),advanceSpring({position:0,velocity:0},1,.064));
});
test('motion reverses continuously, ignores duplicate targets, and stops when settled',()=>{
  const {motion,frame,painted,callbacks}=fixture();
  motion.setExpanded(true);motion.setExpanded(true);assert.equal(callbacks.size,1);
  frame(0);frame(16);frame(32);
  const before=painted.at(-1);motion.setExpanded(false);
  assert.equal(painted.at(-1),before,'反向操作不能重置当前位置');
  frame(48);assert.ok(painted.at(-1)>before,'反向后保留当前速度，再平滑减速');
  for(let time=64;time<=1200;time+=16)frame(time);
  assert.equal(painted.at(-1),0);assert.equal(callbacks.size,0);
  motion.setExpanded(true);motion.dispose();assert.equal(callbacks.size,0);
  motion.setExpanded(true);assert.equal(callbacks.size,0);
});
test('reduced motion immediately settles and shape endpoints remain stable',()=>{
  const {motion,frame,painted,callbacks}=fixture();motion.setExpanded(true);frame(0);frame(16);
  motion.setReducedMotion(true);assert.equal(painted.at(-1),1);assert.equal(callbacks.size,0);
  motion.setExpanded(false);assert.equal(painted.at(-1),0);assert.equal(callbacks.size,0);
  const closed=islandFrame(0,432,466),open=islandFrame(1,432,466);
  assert.match(closed.clipPath,/128px 434px/);assert.equal(closed.panelOpacity,0);assert.equal(closed.compactOpacity,1);
  assert.match(open.clipPath,/0px 0px 0px/);assert.equal(open.panelOpacity,1);assert.equal(open.compactOpacity,0);
  assert.deepEqual(islandFrame(1.03,432,466),open);
});
