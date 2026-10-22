import { BrowserWindow, WebContentsView, session, ipcMain, globalShortcut, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLATFORMS, DEFAULT_SETTINGS, platformId, allowedNavigation, validateSettings, validateAction, safeSuppression, initialVideoBounds } from './policy.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const HOST_CHANNEL = 'guagua-video-host', PAGE_CHANNEL = 'guagua-video-page', STATE_CHANNEL = 'guagua-video-state', CONTROL_CHANNEL = 'guagua-video-control';
export async function createVideoModule({ mainWindow, dataDir, cacheDir, iconPath, getSuppression = () => 'detector-unavailable', onState = () => { }, theme = 'dark' } = {}) {
    if (!path.isAbsolute(dataDir || '') || !path.isAbsolute(cacheDir || ''))
        throw new Error('影音数据目录必须位于瓜瓜安装目录');
    const root = path.join(dataDir, 'modules', 'video');
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(cacheDir, 'modules', 'video'), { recursive: true });
    const settingsPath = path.join(root, 'settings.json'), hostURL = pathToFileURL(path.join(here, 'host.html')).href;
    let settings = { ...DEFAULT_SETTINGS };
    try {
        settings = validateSettings(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
    }
    catch { }
    let win = null, current = null, platform = null, wanted = false, floating = false, compact = false, disposed = false;
    let suppression = safeSuppression(getSuppression), lastError = '', registered = '', hostReady = null, lastReload = 0, queue = Promise.resolve(), pageBounds = null;
    const views = new Map();
    theme = theme === 'light' ? 'light' : 'dark';
    const getState = () => ({ platform, platformName: PLATFORMS[platform]?.name || '', opened: !!win && !win.isDestroyed(), visible: !!win && !win.isDestroyed() && win.isVisible(), floating, compact, suppressed: suppression, loading: !!current?.loading, error: lastError, theme, settings: { ...settings }, shortcutRegistered: !!registered });
    function publish() { const state = getState(); if (win && !win.isDestroyed())
        win.webContents.send(STATE_CHANNEL, state); try {
        onState(state);
    }
    catch { } return state; }
    function failure(message) { lastError = String(message).slice(0, 240); publish(); }
    function control(entry, data) { if (entry && !entry.view.webContents.isDestroyed())
        entry.view.webContents.send(CONTROL_CHANNEL, data); }
    // 重复隐藏不能覆盖第一次暂停时记下的播放状态，手动暂停的视频应继续保持暂停。
    function pause(entry) {
        if (!entry || entry.suspended) return;
        const contents = entry.view.webContents;
        // 整个 WebContents 静音覆盖嵌套播放器；页面暂停仍负责主页面的播放进度。
        entry.restoreAudioMuted = contents.isAudioMuted();
        contents.setAudioMuted(true);
        entry.suspended = true;
        control(entry, { type: 'pause' });
    }
    function resume(entry) {
        if (!entry || !entry.suspended) return;
        // 恢复用户原有的静音选择，而不是一律解除静音。
        entry.view.webContents.setAudioMuted(entry.restoreAudioMuted);
        entry.suspended = false;
        control(entry, { type: 'resume' });
    }
    function layout() { if (!win || win.isDestroyed())
        return; const [w, h] = win.getContentSize(); for (const entry of views.values())
        entry.view.setBounds({ x: 0, y: floating ? 0 : 48, width: w, height: Math.max(1, h - (floating ? 0 : 48)) }); }
    function applyWindowSettings() { if (win && !win.isDestroyed()) {
        win.setAlwaysOnTop(floating && settings.topmost);
        win.setOpacity(floating ? settings.opacity / 100 : 1);
        win.setBackgroundColor(theme === 'light' ? '#e9e9e9' : '#272727');
    } }
    function syncVisibility(focus = false) {
        suppression = safeSuppression(getSuppression);
        if (!win || win.isDestroyed())
            return publish();
        // wanted 保留用户的显隐意愿；系统抑制解除仅恢复原本可见的窗口。
        if (!wanted || suppression) {
            for (const entry of views.values())
                pause(entry);
            win.hide();
        }
        else {
            if (win.isMinimized())
                win.restore();
            if (focus) {
                win.show();
                win.focus();
            }
            else
                win.showInactive();
            if (current)
                resume(current);
        }
        return publish();
    }
    function closePlayer() { wanted = false; for (const entry of views.values()) {
        pause(entry);
        entry.ses.removeListener('will-download', preventDownload);
        if (!entry.view.webContents.isDestroyed())
            entry.view.webContents.close();
    } views.clear(); current = null; platform = null; floating = false; compact = false; pageBounds = null; if (win && !win.isDestroyed())
        win.destroy(); win = null; hostReady = null; publish(); }
    async function ensureWindow() {
        if (win && !win.isDestroyed()) {
            await hostReady;
            return;
        }
        const parent=mainWindow?.getNormalBounds()||{x:100,y:100,width:1035,height:691};const area=screen.getDisplayMatching(parent).workArea;
        win = new BrowserWindow({ title: '瓜瓜 · 影音', ...initialVideoBounds(parent,area), minWidth: 360, minHeight: 360, show: false, frame: false, fullscreenable: false, backgroundColor: theme === 'light' ? '#e9e9e9' : '#272727', icon: iconPath, webPreferences: { preload: path.join(here, 'host-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
        applyWindowSettings();
        win.on('resize', layout);
        win.on('close', event => { event.preventDefault(); wanted = false; syncVisibility(); });
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', event => event.preventDefault());
        hostReady = win.loadURL(hostURL);
        await hostReady;
        if (disposed)
            throw new Error('影音模块已关闭');
        publish();
    }
    function createView(id) {
        // 独立持久会话只保存于瓜瓜数据根；不引用原应用或聊天会话的 Cookie。
        const ses = session.fromPath(path.join(root, 'sessions', id), { cache: false });
        ses.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'fullscreen' && allowedNavigation(id, wc.getURL())));
        ses.setPermissionCheckHandler((_wc, permission, origin) => permission === 'fullscreen' && allowedNavigation(id, origin));
        ses.on('will-download', preventDownload);
        // 网页全屏只铺满播放器内容区，不将原生窗口放大全屏，避免触发游戏抑制。
        const view = new WebContentsView({ webPreferences: { session: ses, preload: path.join(here, 'page-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false, disableHtmlFullscreenWindowResize: true } });
        const entry = { id, view, ses, loading: true, suspended: true, restoreAudioMuted: view.webContents.isAudioMuted() };
        view.webContents.setAudioMuted(true);
        views.set(id, entry);
        win.contentView.addChildView(view);
        view.webContents.setUserAgent(view.webContents.getUserAgent().replace(/\s(?:Electron|guagua-desktop|star-chat-desktop)\/[\d.]+/g, ''));
        const guard = (event, url) => { if (!allowedNavigation(id, url)) {
            event.preventDefault();
            failure('此链接不属于当前平台，请在浏览器中自行打开。');
        }
        else if (entry === current && floating)
            leaveFloat(); };
        view.webContents.on('will-navigate', guard);
        view.webContents.on('will-redirect', guard);
        view.webContents.on('content-bounds-updated', event => event.preventDefault());
        view.webContents.setWindowOpenHandler(({ url }) => { if (allowedNavigation(id, url)) {
            leaveFloat();
            void view.webContents.loadURL(url).catch(() => { });
        }
        else
            failure('已拦截平台以外的新窗口。'); return { action: 'deny' }; });
        view.webContents.on('did-start-loading', () => { entry.loading = true; if (entry === current)
            publish(); });
        view.webContents.on('did-stop-loading', () => { entry.loading = false; if (entry === current)
            publish(); });
        view.webContents.on('did-fail-load', (_event, code, _description, _url, isMain) => { if (code !== -3 && isMain && entry === current) {
            entry.loading = false;
            failure('平台页面加载失败，请检查网络后重试。');
        } });
        view.webContents.on('render-process-gone', () => { if (entry === current)
            failure('平台页面已停止运行，请重新加载。'); });
        view.webContents.on('did-finish-load', () => { control(entry, { type: 'configure', platform: id, opacity: settings.opacity }); if (entry === current && wanted && !suppression)
            resume(entry);
        else
            control(entry, { type: 'pause' }); layout(); publish(); });
        void view.webContents.loadURL(PLATFORMS[id].home).catch(() => { });
        return entry;
    }
    function preventDownload(event) { event.preventDefault(); failure('影音模块用于网页播放，下载请在系统浏览器中完成。'); }
    function leaveFloat() { if (!floating)
        return; control(current, { type: 'float', value: false }); floating = false; compact = false; if (pageBounds && win && !win.isDestroyed())
        win.setBounds(pageBounds); pageBounds = null; applyWindowSettings(); layout(); publish(); }
    async function openNow(id) { platformId(id); await ensureWindow(); leaveFloat(); pause(current); for (const entry of views.values())
        entry.view.setVisible(false); platform = id; lastError = ''; current = views.get(id) || createView(id); current.view.setVisible(true); layout(); wanted = true; return syncVisibility(true); }
    function serialize(operation) { const result = queue.then(() => { if (disposed)
        throw new Error('影音模块已关闭'); return operation(); }); queue = result.catch(() => { }); return result; }
    async function actionNow(name, value) {
        validateAction(name, value);
        if (name === 'close') {
            closePlayer();
            return getState();
        }
        if (!win || !current)
            throw new Error('请先选择影音平台');
        lastError = '';
        if (name === 'hide') {
            wanted = false;
            return syncVisibility();
        }
        if (name === 'show') {
            wanted = true;
            return syncVisibility(true);
        }
        if (name === 'toggle') {
            wanted = !wanted;
            return syncVisibility(wanted);
        }
        if (name === 'float') {
            if (!suppression)
                control(current, { type: 'float', value: true });
            else
                throw new Error('当前处于全屏或勿扰状态，影音已暂停。');
        }
        if (name === 'page')
            leaveFloat();
        if (name === 'compact') {
            if (!floating)
                throw new Error('请先进入视频小窗');
            compact = value;
            control(current, { type: 'compact', value });
        }
        if (name === 'back') {
            leaveFloat();
            const history = current.view.webContents.navigationHistory;
            if (history.canGoBack())
                history.goBack();
        }
        if (name === 'home') {
            leaveFloat();
            void current.view.webContents.loadURL(PLATFORMS[platform].home).catch(() => { });
        }
        if (name === 'reload') {
            if (Date.now() - lastReload < 5000)
                throw new Error('请稍后再刷新。');
            lastReload = Date.now();
            leaveFloat();
            current.view.webContents.reload();
        }
        return publish();
    }
    function registerShortcut(next) {
        const key = next.shortcutEnabled ? next.shortcut : '';
        if (key === registered)
            return;
        if (key && !globalShortcut.register(key, () => { if (!win)
            return; wanted = !wanted; syncVisibility(wanted); }))
            throw new Error('该快捷键已被占用，请更换组合键。');
        if (registered)
            globalShortcut.unregister(registered);
        registered = key;
    }
    async function updateNow(patch) { const next = validateSettings(patch, settings), previous = { ...settings }; registerShortcut(next); try {
        fs.writeFileSync(settingsPath + '.tmp', JSON.stringify(next));
        fs.renameSync(settingsPath + '.tmp', settingsPath);
    }
    catch (error) {
        registerShortcut(previous);
        throw new Error('影音设置保存失败，请检查安装目录权限。');
    } settings = next; applyWindowSettings(); control(current, { type: 'opacity', value: settings.opacity }); return publish(); }
    // 本地控制页校验窗口、主 frame 和确切地址；网站预加载走另一条有限事件通道。
    const trustedHost = event => win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === hostURL;
    async function hostHandler(event, payload) { if (!trustedHost(event) || !payload || typeof payload !== 'object')
        throw new Error('影音操作来源无效'); if (payload.op === 'state')
        return getState(); if (payload.op === 'action')
        return serialize(() => actionNow(payload.name, payload.value)); if (payload.op === 'settings')
        return serialize(() => updateNow(payload.patch)); throw new Error('不支持的影音指令'); }
    function pageHandler(event, data) {
        const entry = [...views.values()].find(e => e.view.webContents === event.sender);
        if (!entry || event.senderFrame !== entry.view.webContents.mainFrame || !allowedNavigation(entry.id, event.senderFrame.url) || !data || typeof data !== 'object')
            return;
        if (data.type === 'ready') {
            control(entry, { type: 'configure', platform: entry.id, opacity: settings.opacity });
            control(entry, { type: entry.suspended ? 'pause' : 'resume' });
            return;
        }
        if (entry !== current)
            return;
        if(data.type==='opacity'&&floating&&Number.isInteger(data.value)&&data.value>=20&&data.value<=100){void serialize(()=>updateNow({opacity:data.value})).catch(e=>failure(e.message));return;}
        if (data.type === 'float-ready' && data.value === true && !suppression && wanted) {
            if (!floating) {
                pageBounds = win.getBounds();
                const area = screen.getDisplayMatching(pageBounds).workArea;
                win.setBounds({ x: Math.max(area.x, Math.min(pageBounds.x, area.x + area.width - 420)), y: Math.max(area.y, Math.min(pageBounds.y, area.y + area.height - 620)), width: 420, height: 620 });
            }
            floating = true;
            compact = false;
            applyWindowSettings();
            layout();
            publish();
        }
        else if (data.type === 'error')
            failure(typeof data.message === 'string' ? data.message : '视频操作失败');
        else if (data.type === 'toolbar' && ['page', 'hide', 'compact'].includes(data.action)) {
            void serialize(() => actionNow(data.action, data.action === 'compact' ? data.value : undefined)).catch(error => failure(error.message));
        }
    }
    ipcMain.handle(HOST_CHANNEL, hostHandler);
    ipcMain.on(PAGE_CHANNEL, pageHandler);
    try {
        registerShortcut(settings);
    }
    catch (error) {
        lastError = error.message;
    }
    const timer = setInterval(() => { const next = safeSuppression(getSuppression); if (next !== suppression) {
        suppression = next;
        syncVisibility();
    } if (win && current && floating && win.isVisible()) {
        const p = screen.getCursorScreenPoint(), b = win.getBounds();
        const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
        const nextCompact = !inside;
        if (nextCompact !== compact) {
            compact = nextCompact;
            control(current, { type: 'compact', value: compact });
            publish();
        }
    } }, 250);
    timer.unref?.();
    publish();
    return { getState, open: id => serialize(() => openNow(id)), action: (name, value) => serialize(() => actionNow(name, value)), updateSettings: patch => serialize(() => updateNow(patch)), setTheme: value => serialize(() => { if (!['light', 'dark'].includes(value))
            throw new Error('主题无效'); theme = value; applyWindowSettings(); return publish(); }), dispose() { if (disposed)
            return; disposed = true; clearInterval(timer); if (registered)
            globalShortcut.unregister(registered); registered = ''; ipcMain.removeHandler(HOST_CHANNEL); ipcMain.removeListener(PAGE_CHANNEL, pageHandler); for (const e of views.values())
            e.ses.removeListener('will-download', preventDownload); closePlayer(); } };
}
export default createVideoModule;
