import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQuickFiles,validateQuickInput,normalizeMusicState} from '../desktop/companion-policy.mjs';
const agents=[{id:'claude'}];
test('刘海附件支持只发送文件，拦截数量、体积与格式异常',()=>{assert.deepEqual(validateQuickInput({agentId:'claude',text:'',attachmentIds:['file-1']},agents),{agentId:'claude',text:'',attachmentIds:['file-1']});const file={name:'材料.md',base64:Buffer.from('项目资料').toString('base64')};assert.equal(validateQuickFiles({agentId:'claude',files:[file]},agents).files[0].name,'材料.md');for(const value of [{agentId:'missing',files:[file]},{agentId:'claude',files:Array(9).fill(file)},{agentId:'claude',files:[{...file,base64:'<script>'}]}])assert.throws(()=>validateQuickFiles(value,agents));assert.throws(()=>validateQuickInput({agentId:'claude',text:'',attachmentIds:['../file']},agents));});
test('音乐通知只保留当前歌词、曲名和有界音频能量',()=>{assert.deepEqual(normalizeMusicState({playing:true,title:'歌曲',lyric:'当前歌词',bands:[-5,2,'x',.3,.5],cookie:'secret'}),{playing:true,title:'歌曲',artist:'',lyric:'当前歌词',bands:[0,1,0,.3,.5]});});
