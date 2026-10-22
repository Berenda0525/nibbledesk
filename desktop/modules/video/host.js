const api = window.guaguaVideo;
let state;
const $ = id => document.getElementById(id);
const icons = { back: 'm15 18-6-6 6-6', home: 'm3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8', reload: 'M20 11a8 8 0 1 0-2 6 M20 4v7h-7', hide: 'M5 12h14', close: 'm6 6 12 12 M6 18 18 6', topmost: 'm16 3 5 5-4 1-3 3-1 5-3-3-6 6 M3 3l18 18' };
for (const [name, d] of Object.entries(icons)) {
    const button = name === 'topmost' ? $('topmost') : document.querySelector(`[data-action="${name}"]`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '17', height: '17', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }))
        svg.setAttribute(key, value);
    p.setAttribute('d', d);
    svg.append(p);
    button.replaceChildren(svg);
}
function render(next) { state = next; document.body.dataset.theme = next.theme; $('platform').textContent = next.platformName || '影音'; $('status').textContent = next.error || (next.loading ? '加载中…' : ''); $('opacity').value = next.settings.opacity; $('topmost').setAttribute('aria-pressed', String(next.settings.topmost)); }
async function run(operation) { try {
    render(await operation());
}
catch (error) {
    $('status').textContent = error.message || '操作未完成';
} }
for (const button of document.querySelectorAll('[data-action]'))
    button.onclick = () => run(() => api.action(button.dataset.action));
$('topmost').onclick = () => run(() => api.settings({ topmost: !state.settings.topmost }));
$('opacity').onchange = () => run(() => api.settings({ opacity: Number($('opacity').value) }));
api.onState(render);
void run(() => api.state());
