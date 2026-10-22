import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {DEFAULT_AGENTS, DEFAULT_MODELS} from '../core/catalog.mjs';

const root = process.cwd();
const output = await fs.mkdtemp(path.join(root, '.test-data', 'frontend-avatar-'));
const result = {passed: false, mockBridge: true, paidRequests: 0, checks: [], screenshots: [], errors: []};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const publicBytes = await fs.readFile(path.join(root, 'public/assets/agents/doubao-user.png'));
const distBytes = await fs.readFile(path.join(root, 'dist/assets/agents/doubao-user.png'));
assert.equal(hash(publicBytes), hash(distBytes));
assert.equal(hash(publicBytes), '61a951317481d98a4a92e1f969db2f371421f00b993204a7f4ed8fa5c559cc8c');
if (process.argv[2]) assert.equal(hash(publicBytes), hash(await fs.readFile(process.argv[2])));
result.sha256 = hash(publicBytes);
result.checks.push('原图、public 资源及 dist 资源逐字节一致');
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
    const url = request.url.split('?')[0];
    const file = path.join(root, 'dist', url === '/' ? 'index.html' : decodeURIComponent(url));
    const type = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png'}[path.extname(file)] || 'application/octet-stream';
    response.setHeader('Content-Type', type);
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1100, height: 760}});
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => result.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({agents, models}) => {
    let listeners = [];
    const now = new Date().toISOString();
    const state = {agents, models, assets: [], providers: {apimart: {configured: true}, volcano: {configured: true}}, profile: {displayName: '头像检查', theme: 'dark'}, chats: [{id: 'doubao-preview', title: '豆包', type: 'direct', agentIds: ['doubao'], updatedAt: now, messages: [{id: 'preview', role: 'assistant', agentId: 'doubao', content: '你好，很高兴见到你。', createdAt: now}]}], pendingApprovals: [], version: 'avatar-test'};
    window.stellar = {
      onEvent: listener => { listeners.push(listener); return () => { listeners = listeners.filter(item => item !== listener); }; },
      call: async (action, payload = {}) => {
        if (action === 'bootstrap') return structuredClone(state);
        if (action === 'updateProfile') {
          state.profile = {...state.profile, ...payload};
          listeners.forEach(listener => listener({type: 'state', state: structuredClone(state)}));
          return structuredClone(state);
        }
        throw new Error(`头像检查不允许调用 ${action}`);
      }
    };
  }, {agents: DEFAULT_AGENTS, models: DEFAULT_MODELS});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByRole('button', {name: '联系人', exact: true}).click();
  const avatar = page.locator('.contacts-list .avatar-doubao');
  const assertRound = async locator => {
    const items = await locator.evaluateAll(elements => elements.map(element => {
      const image = element.querySelector('img'), style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return {radius: style.borderRadius, overflow: style.overflow, padding: style.padding, background: style.backgroundColor, width: rect.width, height: rect.height, imageRadius: getComputedStyle(image).borderRadius, fit: getComputedStyle(image).objectFit};
    }));
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.equal(item.radius, '50%'); assert.equal(item.overflow, 'hidden'); assert.equal(item.padding, '0px');
      assert.equal(item.width, item.height); assert.equal(item.imageRadius, '50%'); assert.equal(item.fit, 'cover');
      assert.equal(item.background, 'rgba(0, 0, 0, 0)');
    }
  };
  await avatar.locator('img').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.contacts-list .image-avatar img')].every(image => image.complete && image.naturalWidth > 0));
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page.getByRole('button', {name: '更多设置', exact: true}).click();
      await page.getByRole('button', {name: '切换浅色模式', exact: true}).click();
    }
    const actual = await avatar.evaluate(element => {
      const image = element.querySelector('img');
      return {src: image.src, width: image.naturalWidth, height: image.naturalHeight, background: getComputedStyle(element).backgroundColor, imageFit: getComputedStyle(image).objectFit};
    });
    assert.ok(actual.src.endsWith('/assets/agents/doubao-user.png'));
    assert.equal(actual.width, 159); assert.equal(actual.height, 160);
    assert.equal(actual.background, 'rgba(0, 0, 0, 0)'); assert.equal(actual.imageFit, 'cover');
    await assertRound(page.locator('.avatar-doubao.image-avatar'));
    const otherAvatars = await page.locator('.contacts-list .image-avatar:not(.avatar-doubao)').evaluateAll(elements => elements.map(element => ({radius: getComputedStyle(element).borderRadius, overflow: getComputedStyle(element).overflow})));
    assert.ok(otherAvatars.every(item => item.radius !== '50%' && item.overflow === 'visible'));
    const screenshot = path.join(output, `doubao-${theme}.png`);
    await page.screenshot({path: screenshot}); result.screenshots.push(screenshot);
    result.checks.push(`${theme}：聊天列表与联系人豆包头像圆形裁切，原图加载、容器透明，其他头像样式保持`);
  }
  await page.getByRole('button', {name: '编辑 豆包', exact: true}).click();
  await page.getByRole('dialog').locator('.avatar-doubao img').waitFor();
  await assertRound(page.getByRole('dialog').locator('.avatar-doubao'));
  const dialogScreenshot = path.join(output, 'doubao-settings.png');
  await page.screenshot({path: dialogScreenshot}); result.screenshots.push(dialogScreenshot);
  await page.getByRole('dialog').getByRole('button', {name: '关闭', exact: true}).click();
  await page.getByRole('button', {name: '聊天', exact: true}).click();
  await page.locator('.transcript .avatar-doubao img').waitFor();
  await assertRound(page.locator('.transcript .avatar-doubao'));
  await page.getByRole('button', {name: '会话操作', exact: true}).click();
  await page.getByRole('button', {name: '查看成员与文件', exact: true}).click();
  await assertRound(page.locator('.member-details .avatar-doubao'));
  const chatScreenshot = path.join(output, 'doubao-chat.png');
  await page.screenshot({path: chatScreenshot}); result.screenshots.push(chatScreenshot);
  assert.deepEqual(result.errors, []);
  result.checks.push('设置面板、消息头像及成员信息均为圆形裁切，页面无运行错误');
  result.passed = true;
} catch (error) {
  result.error = error.stack;
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({output, ...result}, null, 2));
}
