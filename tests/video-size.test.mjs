import test from 'node:test';
import assert from 'node:assert/strict';
import {initialVideoBounds} from '../desktop/modules/video/policy.mjs';
test('影音默认窗口小于主窗口并保持在可用屏幕内',()=>{const p={x:100,y:50,width:1035,height:691},b=initialVideoBounds(p,{x:0,y:0,width:1600,height:900});assert.ok(b.width<p.width);assert.ok(b.height<p.height);assert.ok(b.x>=p.x&&b.y>=p.y);assert.ok(b.x+b.width<=1600&&b.y+b.height<=900);});
