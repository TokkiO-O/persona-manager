import { EXT, VERSION, REMOTE_MANIFEST_URLS, REMOTE_CHANGELOG_URLS } from './constants.js';
import { state } from './state.js';
import { escapeHtml } from './util.js';


let _uiRefresh = () => {};
export function setUpdateUiRefresh(fn) {
    _uiRefresh = typeof fn === 'function' ? fn : () => {};
}
function refreshUi() {
    try { _uiRefresh(); } catch (e) { console.error(e); }
}


/* ---------- Updates (remote manifest + CHANGELOG.md) ---------- */

export async function fetchText(url) {
    // Append a per-call cache-buster because some browser/CDN layers ignore
    // the no-store hint (raw.githubusercontent.com has ~5 min CDN TTL).
    const sep = url.includes('?') ? '&' : '?';
    const u = `${url}${sep}t=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = await fetch(u, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
}

/** Try multiple mirrors until one succeeds (GitHub raw often blocked). */
export async function fetchTextFromMirrors(urls) {
    const list = Array.isArray(urls) ? urls : [urls];
    const errors = [];
    for (const url of list) {
        try {
            const text = await fetchText(url);
            if (text != null && String(text).length) return { text: String(text), url };
        } catch (e) {
            errors.push(`${url} → ${e?.message || e}`);
            console.warn(`[${EXT}] mirror failed:`, url, e);
        }
    }
    throw new Error(errors.length ? errors.join(' | ') : 'no mirrors');
}

/** ST API calls need X-CSRF-Token or ForbiddenError: Invalid CSRF token */
export async function getStRequestHeaders() {
    try {
        if (typeof window.getRequestHeaders === 'function') {
            return window.getRequestHeaders();
        }
    } catch { /* ignore */ }
    try {
        const ctx = window.SillyTavern?.getContext?.();
        if (typeof ctx?.getRequestHeaders === 'function') {
            return ctx.getRequestHeaders();
        }
    } catch { /* ignore */ }
    let token = 'disabled';
    try {
        const r = await fetch('/csrf-token', { credentials: 'same-origin' });
        if (r.ok) {
            const data = await r.json();
            if (data?.token) token = data.token;
        }
    } catch { /* ignore */ }
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
    };
}

export async function callExtensionUpdate() {
    const candidates = [];
    if (typeof window.updateExtension === 'function') {
        candidates.push(() => window.updateExtension('persona-manager'));
    }
    candidates.push(() => updateViaApi({ extensionName: 'persona-manager', global: false }));
    candidates.push(() => updateViaApi({ extensionName: 'persona-manager', global: true }));
    candidates.push(() => updateViaApi({ extensionName: 'third-party/Persona Manager', global: false }));
    candidates.push(() => updateViaApi({ extensionName: 'third-party/Persona-Manager', global: false }));
    candidates.push(() => updateViaApi({ extensionName: 'third-party/persona-manager', global: false }));

    let lastError = null;
    for (const run of candidates) {
        try {
            return await run();
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(
        `酒馆没找到本扩展目录，自动化更新失败。` +
        `\n请到 https://github.com/xingx121/persona-manager 手动下载 zip，` +
        `解压覆盖到 data/default-user/extensions/ 下的人设管理文件夹。` +
        `\n（最近错误：${lastError?.message || lastError || '未知'}）`
    );
}

export async function updateViaApi(payload) {
    const headers = await getStRequestHeaders();
    const res = await fetch('/api/extensions/update', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return { message: text };
    }
}

export async function checkForUpdates() {
    state.updateInfo = { checking: true };
    if (state.tab === 'settings') refreshUi();
    try {
        const { text, url: usedUrl } = await fetchTextFromMirrors(REMOTE_MANIFEST_URLS);
        const remote = JSON.parse(text);
        const rv = String(remote.version || '');
        const available = Boolean(rv && rv !== VERSION);
        let changelog = '';
        try {
            const ch = await fetchTextFromMirrors(REMOTE_CHANGELOG_URLS);
            changelog = ch.text;
        } catch {
            changelog = remote.description || '（无法获取 CHANGELOG.md）';
        }
        state.updateInfo = {
            checked: true,
            available,
            remoteVersion: rv,
            changelog,
            source: usedUrl,
            error: false,
        };
        console.log(`[${EXT}] update check ok via`, usedUrl, 'remote=', rv);
    } catch (e) {
        const msg = e?.message || String(e);
        state.updateInfo = { checked: true, available: false, error: true, message: msg };
        console.error(`[${EXT}] update check failed`, e);
    }
    if (state.tab === 'settings' || state.active) refreshUi();
    return state.updateInfo;
}

/** Only the first ## section of CHANGELOG.md (latest version). */
export function extractLatestChangelogSection(md) {
    const text = String(md || '').replace(/^\uFEFF/, '').trim();
    if (!text) return '（无日志）';
    const headingRe = /^##\s+.+$/gm;
    const matches = [...text.matchAll(headingRe)];
    if (!matches.length) {
        // No ## headings: return whole file but cap length
        return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
    }
    const start = matches[0].index;
    const end = matches[1] ? matches[1].index : text.length;
    return text.slice(start, end).trim();
}

export function showUpdateModal() {
    const info = state.updateInfo || {};
    const log = extractLatestChangelogSection(info.changelog || '');
    const available = Boolean(info.available);
    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay';
    overlay.innerHTML = `
        <div class="pmp18-editor" style="max-width:560px">
            <div class="pmp18-editor-head">
                <strong>${available ? '发现新版本' : '更新日志'}</strong>
                <button type="button" class="pmp18-close pmp18-editor-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p>当前 <b>v${VERSION}</b>${info.remoteVersion ? ` · 远程 <b>v${escapeHtml(String(info.remoteVersion))}</b>` : ''}
            ${available ? '' : ' · <span style="color:#3c9764">已是最新</span>'}</p>
            <pre class="pmp18-changelog">${escapeHtml(log)}</pre>
            <div class="pmp18-editor-actions">
                <button type="button" class="pmp18-small-btn pmp18-editor-cancel">关闭</button>
                ${available ? '<button type="button" class="pmp18-primary-btn pmp18-do-update">立即更新</button>' : ''}
            </div>
        </div>`;
    const close = () => overlay.remove();
    overlay.querySelector('.pmp18-editor-close').onclick = close;
    overlay.querySelector('.pmp18-editor-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const doBtn = overlay.querySelector('.pmp18-do-update');
    if (doBtn) {
        doBtn.onclick = async () => {
            doBtn.disabled = true;
            doBtn.textContent = '更新中…';
            try {
                await callExtensionUpdate();
                doBtn.textContent = '完成，正在刷新…';
                setTimeout(() => location.reload(), 500);
            } catch (e) {
                doBtn.disabled = false;
                doBtn.textContent = '立即更新';
                const msg = e?.message || String(e);
                if (typeof toastr !== 'undefined') toastr.error(`更新失败：${msg}`);
                console.error(`[${EXT}] update failed`, e);
            }
        };
    }
    document.body.appendChild(overlay);
}

