let guaguaOpacity=100,guaguaOpacityInput,guaguaOpacityLabel;
const { ipcRenderer } = require('electron');
// Isolated-world adapter for the platform's own HTML video; exposes no page API.
let platform = '', suspended = true, paused = [], floating = false, mounted = null, layer = null, toolbar = null, compact = false, epoch = 0, switching = false, lastWheel = 0;
const report = (type, extra = {}) => ipcRenderer.send('guagua-video-page', { type, ...extra });
function candidate() { return [...document.querySelectorAll('video')].filter(v => v !== mounted?.video && v.readyState >= 2).map(v => { const r = v.getBoundingClientRect(); return { v, score: Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(0, r.left)) }; }).filter(x => x.score > 100).sort((a, b) => b.score - a.score)[0]?.v; }
function restore() { if (!mounted)
    return; const { video, placeholder, css, controls } = mounted; mounted = null; if (placeholder.isConnected)
    placeholder.replaceWith(video);
else
    video.pause(); if (css === null)
    video.removeAttribute('style');
else
    video.setAttribute('style', css); video.controls = controls; }
function mount(video) { restore(); const placeholder = document.createElement('div'), r = video.getBoundingClientRect(); placeholder.style.cssText = `width:${r.width}px;height:${r.height}px`; mounted = { video, placeholder, css: video.getAttribute('style'), controls: video.controls }; video.replaceWith(placeholder); layer.append(video); video.style.cssText = 'position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important;max-width:none!important;transform:none!important'; video.controls = true; }
function setCompact(value) { compact = value; if (toolbar) {
    toolbar.style.opacity = value ? '0' : '1';
    toolbar.style.pointerEvents = value ? 'none' : 'auto';
} }
function ensure() {
    if (layer)
        return;
    const css = document.createElement('style');
    css.textContent = 'body.guagua-video-float{overflow:hidden!important}body.guagua-video-float>*{visibility:hidden!important}body.guagua-video-float #guagua-video-layer,body.guagua-video-float #guagua-video-layer *{visibility:visible!important}#guagua-video-layer{display:none;position:fixed;inset:0;background:#000;z-index:2147483647}body.guagua-video-float #guagua-video-layer{display:block}#guagua-video-toolbar button:focus-visible{outline:2px solid #9bc4ff}@media(prefers-reduced-motion:reduce){#guagua-video-toolbar{transition:none!important}}';
    document.head.append(css);
    layer = document.createElement('div');
    layer.id = 'guagua-video-layer';
    const drag = document.createElement('div');
    drag.style.cssText = 'position:absolute;top:0;left:0;right:0;height:12px;z-index:4;-webkit-app-region:drag';
    toolbar = document.createElement('div');
    toolbar.id = 'guagua-video-toolbar';
    toolbar.style.cssText = 'position:absolute;top:14px;left:14px;right:14px;z-index:5;display:flex;align-items:center;gap:6px;padding:7px;border:1px solid #ffffff18;border-radius:12px;background:#202020dd;backdrop-filter:blur(16px);color:#ededed;transition:opacity 160ms ease;-webkit-app-region:no-drag';
    const button = (d, label, action) => { const b = document.createElement('button'), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }))
        svg.setAttribute(key, value); p.setAttribute('d', d); svg.append(p); b.append(svg); b.title = label; b.setAttribute('aria-label', label); b.style.cssText = 'display:grid;place-items:center;border:0;background:transparent;color:inherit;border-radius:7px;width:32px;height:30px;cursor:pointer'; b.onclick = event => { if (!event.isTrusted)
        return; report('toolbar', { action, value: action === 'compact' ? true : undefined }); }; toolbar.append(b); };
    button('m9 10-5-5 5-5 M4 5h10a6 6 0 0 1 0 12h-2', '返回网页', 'page');
    const title = document.createElement('span');
    title.textContent = '视频小窗';
    title.style.cssText = 'flex:1;font:12px Segoe UI,Microsoft YaHei UI,sans-serif;color:#b7b7b7';
    toolbar.append(title);
    guaguaOpacityInput=document.createElement('input');guaguaOpacityInput.type='range';guaguaOpacityInput.min='20';guaguaOpacityInput.max='100';guaguaOpacityInput.value=String(guaguaOpacity);guaguaOpacityInput.title='小窗不透明度';guaguaOpacityInput.setAttribute('aria-label','小窗不透明度');guaguaOpacityInput.style.cssText='width:80px;min-width:45px;accent-color:#83c2a2;cursor:pointer';
    guaguaOpacityLabel=document.createElement('span');guaguaOpacityLabel.style.cssText='font:10px Segoe UI,sans-serif;width:29px;text-align:right';guaguaOpacityLabel.textContent=guaguaOpacity+'%';
    guaguaOpacityInput.oninput=()=>{guaguaOpacityLabel.textContent=guaguaOpacityInput.value+'%';};
    guaguaOpacityInput.onchange=event=>{if(event.isTrusted)report('opacity',{value:Number(guaguaOpacityInput.value)});};
    toolbar.append(guaguaOpacityInput,guaguaOpacityLabel);
    button('m6 15 6-6 6 6', '收起工具栏', 'compact');
    button('M5 12h14', '隐藏并暂停', 'hide');
    toolbar.addEventListener('wheel', event => event.stopPropagation());
    layer.append(drag, toolbar);
    document.body.append(layer);
    layer.addEventListener('pointermove', event => { if (event.isTrusted && compact && (event.movementX || event.movementY)) {
        setCompact(false);
        report('toolbar', { action: 'compact', value: false });
    } });
    layer.addEventListener('wheel', event => { if (!event.isTrusted || event.ctrlKey || Date.now() - lastWheel < 650 || Math.abs(event.deltaY) < 8)
        return; event.preventDefault(); lastWheel = Date.now(); void step(Math.sign(event.deltaY)); }, { passive: false });
}
function enter() { if (floating)
    return; const video = candidate(); if (!video) {
    report('error', { message: '请在网页中播放视频，再点击“小窗”。' });
    return;
} ensure(); mount(video); floating = true; epoch++; document.body.classList.add('guagua-video-float'); setCompact(false); report('float-ready', { value: true }); }
function exit() { epoch++; floating = false; switching = false; document.body.classList.remove('guagua-video-float'); restore(); setCompact(false); }
// 保留同一批正在播放的元素，重复暂停和页面自动播放都不能改变恢复名单。
function pause() { if (suspended)
    return; suspended = true; paused = [...document.querySelectorAll('video,audio')].filter(v => !v.paused); for (const v of paused)
    v.pause(); }
function resume() { if (!suspended)
    return; suspended = false; const previous = paused; paused = []; for (const v of previous)
    if (v.isConnected)
        void v.play().catch(() => { }); }
function nextControl(direction) { const marker = direction > 0 ? 'next' : 'prev'; const dy = [...document.querySelectorAll('[data-e2e*="video-switch"]')].find(e => e.getAttribute('data-e2e').includes(marker)); if (dy)
    return dy; const label = direction > 0 ? /^(下一篇|下一个|下一条|Next)$/i : /^(上一篇|上一个|上一条|Previous)$/i; const named = [...document.querySelectorAll('button,[role="button"],[aria-label],[title]')].find(e => !layer.contains(e) && label.test((e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim())); if (named)
    return named; if (platform === 'xiaohongshu')
    return document.querySelector(direction > 0 ? '.note-scroller .next,.note-detail-mask .next,.note-detail-mask [class*="next-arrow"]' : '.note-scroller .prev,.note-detail-mask .prev,.note-detail-mask [class*="prev-arrow"]'); return null; }
async function step(direction) { if (!floating || switching || suspended || !mounted || !['douyin', 'xiaohongshu'].includes(platform))
    return; switching = true; const token = epoch, old = mounted.video, src = old.currentSrc, object = old.srcObject, wasPlaying = !old.paused; old.pause(); restore(); try {
    const button = nextControl(direction);
    if (button)
        button.click();
    else {
        const key = direction > 0 ? 'ArrowDown' : 'ArrowUp';
        for (const type of ['keydown', 'keyup'])
            (old.parentElement || document.body).dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode: direction > 0 ? 40 : 38, which: direction > 0 ? 40 : 38, bubbles: true }));
    }
    const end = Date.now() + 6000;
    while (floating && token === epoch && Date.now() < end) {
        const next = candidate();
        if (next && (next !== old || next.currentSrc !== src || next.srcObject !== object)) {
            mount(next);
            return;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    if (token !== epoch || !floating)
        return;
    if (old.isConnected) {
        mount(old);
        if (wasPlaying && !suspended)
            void old.play().catch(() => { });
    }
    report('error', { message: '当前网页未切换视频，请返回网页选择下一条。' });
}
catch {
    report('error', { message: '切换未完成，请返回网页重试。' });
}
finally {
    if (token === epoch)
        switching = false;
} }
ipcRenderer.on('guagua-video-control', (_event, data) => { if (!data || typeof data !== 'object')
    return; if (data.type === 'opacity'||data.type==='configure'){guaguaOpacity=Number(data.type==='configure'?data.opacity:data.value)||100;if(guaguaOpacityInput){guaguaOpacityInput.value=String(guaguaOpacity);guaguaOpacityLabel.textContent=guaguaOpacity+'%';}}
if (data.type === 'configure')
    platform = ['douyin', 'xiaohongshu', 'bilibili'].includes(data.platform) ? data.platform : '';
else if (data.type === 'float')
    data.value ? enter() : exit();
else if (data.type === 'compact')
    setCompact(data.value === true);
else if (data.type === 'pause')
    pause();
else if (data.type === 'resume')
    resume(); });
document.addEventListener('play', event => { if (suspended && ['VIDEO', 'AUDIO'].includes(event.target.tagName))
    event.target.pause(); }, true);
document.addEventListener('keydown', event => { if (!event.isTrusted || !floating)
    return; if (event.key === 'Escape') {
    event.preventDefault();
    report('toolbar', { action: 'page' });
} if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    void step(event.key === 'ArrowDown' ? 1 : -1);
} });
window.addEventListener('DOMContentLoaded', () => report('ready'), { once: true });
