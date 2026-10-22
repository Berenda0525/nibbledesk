import test from 'node:test';
import assert from 'node:assert/strict';
import {updateProfile} from '../core/profile.mjs';

test('profile keeps avatar across name/theme changes and supports explicit removal',()=>{
  const image=Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');
  const first=updateProfile(null,{displayName:' 小瓜 ',avatarData:{mime:'image/png',base64:image}});
  const next=updateProfile(first,{theme:'light'});assert.equal(next.displayName,'小瓜');assert.equal(next.avatarUrl,first.avatarUrl);assert.equal(next.theme,'light');
  assert.equal(updateProfile(next,{removeAvatar:true}).avatarUrl,undefined);assert.equal(first.theme,undefined);
});
test('profile accepts only bounded image data and valid themes',()=>{
  assert.throws(()=>updateProfile({}, {avatarData:{mime:'image/svg+xml',base64:Buffer.from('<svg/>').toString('base64')}}),/PNG/);
  assert.throws(()=>updateProfile({}, {avatarData:{mime:'image/png',base64:'invalid value'}}),/无效/);
  assert.throws(()=>updateProfile({}, {theme:'url(javascript:alert(1))'}),/无效/);
  assert.equal(updateProfile({}, {displayName:'x'.repeat(100)}).displayName.length,40);
});
