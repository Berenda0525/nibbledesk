import test from 'node:test';
import assert from 'node:assert/strict';
import {fitWindow} from '../desktop/window-layout.mjs';
test('默认使用已确认尺寸，恢复窗口时约束在可用屏幕内',()=>{const area={x:100,y:50,width:1600,height:1000};assert.deepEqual(fitWindow(null,area),{width:1035,height:691,x:383,y:205});assert.deepEqual(fitWindow({width:900,height:600,x:5000,y:-1000},area),{width:900,height:600,x:800,y:50});const small=fitWindow({width:9999,height:9999},{x:0,y:0,width:800,height:600});assert.equal(small.width,800);assert.equal(small.height,600);});
