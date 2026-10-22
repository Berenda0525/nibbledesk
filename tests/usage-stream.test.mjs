import {usageTap} from '../core/usage-stream.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
test('原生 Harness 只提取最终 Chat/Responses 用量，支持跨块',()=>{const tap=usageTap('text/event-stream');for(const s of ['data: {"choices":[],"usa','ge":{"prompt_tokens":23,"completion_tokens":4}}\n\ndata: [DONE]\n'])tap.push(Buffer.from(s));assert.deepEqual(tap.finish(),{prompt_tokens:23,completion_tokens:4});const response=usageTap('application/json');response.push(Buffer.from('{"usage":{"input_tokens":3,"output_tokens":2}}'));assert.equal(response.finish().input_tokens,3);});
