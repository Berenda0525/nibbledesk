export const PLATFORMS = Object.freeze({
    douyin: { name: '抖音', home: 'https://www.douyin.com/', domain: 'douyin.com' },
    xiaohongshu: { name: '小红书', home: 'https://www.xiaohongshu.com/explore', domain: 'xiaohongshu.com' },
    bilibili: { name: 'B 站', home: 'https://www.bilibili.com/', domain: 'bilibili.com' },
});
export const DEFAULT_SETTINGS = Object.freeze({ topmost: false, opacity: 100, shortcutEnabled: false, shortcut: 'Alt+Q' });
export function initialVideoBounds(parent,area){const width=Math.min(area.width,Math.max(360,Math.min(900,Math.round(parent.width*.82)))),height=Math.min(area.height,Math.max(360,Math.min(650,Math.round(parent.height*.83))));return {width,height,x:Math.round(Math.max(area.x,Math.min(parent.x+(parent.width-width)/2,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(parent.y+(parent.height-height)/2,area.y+area.height-height)))};}
export function platformId(id) { if (typeof id !== 'string' || !Object.hasOwn(PLATFORMS, id))
    throw new Error('请选择抖音、小红书或 B 站'); return id; }
export function allowedNavigation(id, value) {
    const domain = PLATFORMS[id]?.domain;
    if (!domain || typeof value !== 'string')
        return false;
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (u.hostname === domain || u.hostname.endsWith('.' + domain));
    }
    catch {
        return false;
    }
}
export function validShortcut(value) { return typeof value === 'string' && value.length < 60 && /^(?:(?:Ctrl|Alt|Shift|CommandOrControl)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/i.test(value); }
export function validateSettings(patch, current = DEFAULT_SETTINGS) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw new Error('影音设置无效');
    const next = { ...current };
    for (const [key, value] of Object.entries(patch)) {
        if (!Object.hasOwn(DEFAULT_SETTINGS, key))
            throw new Error('不支持的影音设置');
        if (['topmost', 'shortcutEnabled'].includes(key) && typeof value !== 'boolean')
            throw new Error('开关必须为布尔值');
        if (key === 'opacity' && (!Number.isInteger(value) || value < 20 || value > 100))
            throw new Error('不透明度应为 20 至 100 的整数');
        if (key === 'shortcut' && !validShortcut(value))
            throw new Error('快捷键需包含 Ctrl、Alt 或 Shift，并搭配字母、数字或功能键');
        next[key] = value;
    }
    return next;
}
export function validateAction(name, value) {
    if (name === 'compact') {
        if (typeof value !== 'boolean')
            throw new Error('工具栏状态无效');
        return;
    }
    if (!['show', 'hide', 'toggle', 'float', 'page', 'back', 'home', 'reload', 'close'].includes(name) || value !== undefined)
        throw new Error('不支持的影音操作');
}
export function safeSuppression(get) { try {
    const value = get();
    return value === null ? null : typeof value === 'string' ? value : 'detector-unavailable';
}
catch {
    return 'detector-unavailable';
} }
