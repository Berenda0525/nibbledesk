import test from 'node:test';
import assert from 'node:assert/strict';
import {integrateMusicSource} from '../scripts/music-integration.mjs';
test('music integration changes display literals while retaining API names, URLs and licenses',()=>{
 const code=`import {useFolia} from './useFolia';const label='Welcome to Folia';const url='https://github.com/chthollyphile/folia-major';const font='Folia Noto Serif SC';const page=<h1>Folia</h1>;`;
 const result=integrateMusicSource(code,'/vendor/src/Test.tsx').code;
 assert.match(result,/Welcome to 音乐/);assert.match(result,/>音乐</);assert.match(result,/useFolia/);assert.match(result,/github.com\/chthollyphile\/folia-major/);assert.match(result,/Folia Noto/);
 assert.equal(integrateMusicSource('Folia copyright','/vendor/LICENSE'),null);
});
test('embedded music removes standalone tutorial hosts and has integrated help',()=>{
 for(const name of ['PonderHost','PagePonderTouchButton'])assert.match(integrateMusicSource('',`/vendor/src/components/ponder/${name}.tsx`),/return null/);
 const help=integrateMusicSource('','/vendor/src/components/modal/settings/pages/HelpPage.tsx');assert.match(help,/瓜瓜/);assert.doesNotMatch(help,/Folia|思索|Realeco/);
});
