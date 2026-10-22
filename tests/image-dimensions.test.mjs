import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {imageSize} from 'image-size';

test('图片尺寸解析保留 PNG 能力，并在零长度 ICNS 条目上及时退出',()=>{
 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
 assert.equal(imageSize(pixel).width,1);assert.equal(imageSize(pixel).height,1);
 // 历史漏洞会阻塞事件循环，因此使用有硬超时的独立子进程验证畸形输入。
 const script=`import {imageSize} from 'image-size';const b=Buffer.alloc(16);b.write('icns');b.writeUInt32BE(16,4);b.write('ic07',8);b.writeUInt32BE(0,12);try{imageSize(b)}catch{};console.log('finished');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:3000,windowsHide:true});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/finished/);
});
