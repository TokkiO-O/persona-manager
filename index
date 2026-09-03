import { getContext, extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { getUserAvatars, getThumbnailUrl } from '../../../personas.js';

const EXT = 'persona-manager-pro';
const STORAGE_KEY = 'persona-manager-pro-data';

/** 只存别名等数据到 accountStorage，绝不碰 settings.json */
function loadData() {
    try {
        const raw = accountStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : { aliases: {}, preferNicknames: true };
    } catch {
        return { aliases: {}, preferNicknames: true };
    }
}

function saveData(data) {
    accountStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let pmpData = loadData();

/** 官方 Nicknames 兼容读取 */
function getOfficialNickname(avatarId) {
    try {
        const nick = extension_settings?.nicknames;
        if (!nick?.personas) return null;
        const entry = nick.personas[avatarId];
        if (typeof entry === 'string') return entry;
        if (entry?.global) return entry.global;
        if (entry?.nickname) return entry.nickname;
        return null;
    } catch {
        return null;
    }
}

function getDisplayName(avatarId, originalName) {
    if (pmpData.preferNicknames) {
        const official = getOfficialNickname(avatarId);
        if (official) return official;
    }
    return pmpData.aliases[avatarId] || originalName || avatarId;
}

function getAllPersonas() {
    const personas = power_user.personas || {};
    const descs = power_user.persona_descriptions || {};
    const avatarList = (typeof getUserAvatars === 'function' ? null : Object.keys(personas)) || Object.keys(personas);

    return Object.keys(personas).map(avatarId => {
        const name = personas[avatarId] || avatarId;
        const d = descs[avatarId] || {};
        return {
            avatarId,
            name,
            displayName: getDisplayName(avatarId, name),
            alias: pmpData.aliases[avatarId] || '',
            officialNickname: getOfficialNickname(avatarId),
            description: d.description || '',
            title: d.title || '',
            thumb: (typeof getThumbnailUrl === 'function')
                ? getThumbnailUrl('persona', avatarId)
                : `/useravatars/${avatarId}`,
        };
    });
}

/** 同名分组 */
function groupByName() {
    const map = new Map();
    getAllPersonas().forEach(p => {
        if (!map.has(p.name)) map.set(p.name, []);
        map.get(p.name).push(p);
    });
    return [...map.entries()].filter(([, arr]) => arr.length > 1);
}

/** 内容重复检测 */
function findContentDuplicates() {
    const map = new Map();
    getAllPersonas().forEach(p => {
        const key = `${(p.description || '').trim()}|||${(p.title || '').trim()}`;
        if (!key || key === '|||') return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
    });
    return [...map.values()].filter(arr => arr.length > 1);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderDiff(textA, textB) {
    const linesA = (textA || '').split('\n');
    const linesB = (textB || '').split('\n');
    const max = Math.max(linesA.length, linesB.length);
    let html = '';
    for (let i = 0; i < max; i++) {
        const a = linesA[i] ?? '';
        const b = linesB[i] ?? '';
        if (a === b) {
            html += `<div class="pmp-line same">${escapeHtml(a) || '&nbsp;'}</div>`;
        } else {
            if (a) html += `<div class="pmp-line removed">${escapeHtml(a)}</div>`;
            if (b) html += `<div class="pmp-line added">${escapeHtml(b)}</div>`;
        }
    }
    return html;
}

/** ========== 原生 Persona 列表注入二次别名（方案 A） ========== */
function injectAliasIntoNativeList() {
    const $block = $('#user_avatar_block');
    if (!$block.length) return;

    $block.find('.avatar-container, [data-avatar-id]').each(function () {
        const $card = $(this);
        let avatarId = $card.attr('data-avatar-id') || $card.find('[data-avatar-id]').attr('data-avatar-id');
        if (!avatarId) return;

        // 已经注入过就跳过
        if ($card.find('.pmp-alias-inline').length) return;

        const currentAlias = pmpData.aliases[avatarId] || '';
        const $input = $(`
            <div class="pmp-alias-inline">
                <input type="text" class="text_pole pmp-alias-input-native" 
                       data-id="${avatarId}" 
                       value="${escapeHtml(currentAlias)}" 
                       placeholder="二次别名（仅本界面）"
                       title="二次别名，只在 Persona 界面显示，不影响原名和游玩">
            </div>
        `);

        // 找一个合适的位置插入（名字旁边或卡片底部）
        const $nameArea = $card.find('.ch_name, .name, .persona_name, .avatar_name').first();
        if ($nameArea.length) {
            $nameArea.after($input);
        } else {
            $card.append($input);
        }
    });
}

/** 保存原生列表里的别名输入 */
function bindNativeAliasSave() {
    $(document).on('change blur', '.pmp-alias-input-native', function () {
        const id = $(this).data('id');
        const val = $(this).val().trim();
        if (val) {
            pmpData.aliases[id] = val;
        } else {
            delete pmpData.aliases[id];
        }
        saveData(pmpData);
        // 可选提示
        // toastr.info('别名已保存', '', { timeOut: 1000 });
    });
}

/** 监听列表重新渲染 */
function watchPersonaList() {
    const target = document.getElementById('user_avatar_block');
    if (!target) return;

    const observer = new MutationObserver(debounce(() => {
        injectAliasIntoNativeList();
    }, 150));

    observer.observe(target, { childList: true, subtree: true });
}

/** 简单 debounce */
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/** ========== 对比弹窗（保留之前的功能） ========== */
function openManagerPopup() {
    const $popup = $(`
        <div id="pmp-popup" class="pmp-popup">
            <div class="pmp-header">
                <h3>Persona Manager Pro</h3>
                <div class="pmp-tabs">
                    <button class="pmp-tab active" data-tab="same">同名对比</button>
                    <button class="pmp-tab" data-tab="dup">内容重复</button>
                </div>
                <button class="pmp-close menu_button">×</button>
            </div>
            <div class="pmp-body">
                <div class="pmp-panel" id="pmp-same"></div>
                <div class="pmp-panel" id="pmp-dup" style="display:none;"></div>
            </div>
        </div>
    `);

    $('body').append($popup);
    renderSameNamePanel();
    renderDupPanel();

    $popup.find('.pmp-close').on('click', () => $popup.remove());
    $popup.find('.pmp-tab').on('click', function () {
        $popup.find('.pmp-tab').removeClass('active');
        $(this).addClass('active');
        $popup.find('.pmp-panel').hide();
        $(`#pmp-${$(this).data('tab')}`).show();
    });
}

function renderSameNamePanel() {
    const groups = groupByName();
    const $panel = $('#pmp-same').empty();

    if (groups.length === 0) {
        $panel.html('<p class="text_muted">没有发现同名 Persona。</p>');
        return;
    }

    groups.forEach(([name, list]) => {
        const $group = $(`
            <div class="pmp-group">
                <div class="pmp-group-title">同名：<b>${escapeHtml(name)}</b>（${list.length} 个）</div>
                <div class="pmp-cards"></div>
                <div class="pmp-compare-area" style="display:none;"></div>
            </div>
        `);

        list.forEach(p => {
            $group.find('.pmp-cards').append(`
                <div class="pmp-card" data-id="${p.avatarId}">
                    <img src="${p.thumb}" class="pmp-avatar">
                    <div class="pmp-info">
                        <div class="pmp-name">${escapeHtml(p.displayName)}</div>
                        <div class="pmp-id text_muted">${p.avatarId}</div>
                        <div class="pmp-title">${escapeHtml(p.title || '（无标题）')}</div>
                    </div>
                    <label class="checkbox_label">
                        <input type="checkbox" class="pmp-select"> 对比
                    </label>
                </div>
            `);
        });

        const $btn = $(`<button class="menu_button pmp-do-compare">对比选中</button>`);
        $group.append($btn);

        $btn.on('click', () => {
            const selected = [];
            $group.find('.pmp-select:checked').each(function () {
                const id = $(this).closest('.pmp-card').data('id');
                selected.push(list.find(x => x.avatarId === id));
            });
            if (selected.length < 2) {
                toastr.warning('请至少选择两个 Persona 进行对比');
                return;
            }
            const a = selected[0], b = selected[1];
            $group.find('.pmp-compare-area').html(`
                <div class="pmp-diff-header">
                    <div><b>${escapeHtml(a.displayName)}</b> (${a.avatarId})</div>
                    <div><b>${escapeHtml(b.displayName)}</b> (${b.avatarId})</div>
                </div>
                <div class="pmp-diff-body">
                    <div class="pmp-diff-col"><h4>描述</h4>${renderDiff(a.description, b.description)}</div>
                    <div class="pmp-diff-col"><h4>标题</h4>${renderDiff(a.title, b.title)}</div>
                </div>
            `).show();
        });

        $panel.append($group);
    });
}

function renderDupPanel() {
    const dups = findContentDuplicates();
    const $panel = $('#pmp-dup').empty();

    if (dups.length === 0) {
        $panel.html('<p class="text_muted">没有发现内容完全相同的 Persona。</p>');
        return;
    }

    dups.forEach((list, idx) => {
        const $group = $(`
            <div class="pmp-group">
                <div class="pmp-group-title">重复组 #${idx + 1}（${list.length} 个）</div>
                <div class="pmp-cards"></div>
            </div>
        `);
        list.forEach(p => {
            $group.find('.pmp-cards').append(`
                <div class="pmp-card">
                    <img src="${p.thumb}" class="pmp-avatar">
                    <div class="pmp-info">
                        <div class="pmp-name">${escapeHtml(p.displayName)}</div>
                        <div class="pmp-id text_muted">${p.avatarId}</div>
                        <div class="pmp-title">${escapeHtml(p.title || '（无标题）')}</div>
                    </div>
                </div>
            `);
        });
        $panel.append($group);
    });
}

/** 在扩展设置或 Persona 面板加「打开对比工具」按钮 */
function injectOpenButton() {
    // 尝试挂到 Persona Management 顶部
    const $btn = $(`
        <button id="pmp-open-btn" class="menu_button" style="margin: 6px 0; width: 100%;">
            <i class="fa-solid fa-code-compare"></i> Persona 对比 / 重复检测
        </button>
    `);

    // 优先挂到 persona 相关区域
    const $targets = [
        '#persona-management-button',
        '#user_avatar_block',
        '.persona_management',
        '#rm_extensions_block',
        '#extensions_settings'
    ];

    for (const sel of $targets) {
        const $t = $(sel).first();
        if ($t.length) {
            $t.before($btn);
            break;
        }
    }

    $(document).on('click', '#pmp-open-btn', openManagerPopup);
}

jQuery(async () => {
    pmpData = loadData();
    bindNativeAliasSave();
    injectOpenButton();

    // 等 Persona 列表出现后再注入 + 监听
    const tryInject = () => {
        if ($('#user_avatar_block').length) {
            injectAliasIntoNativeList();
            watchPersonaList();
        } else {
            setTimeout(tryInject, 500);
        }
    };
    tryInject();

    // 列表刷新时也尝试注入
    eventSource.on(event_types.PERSONA_CHANGED, () => {
        setTimeout(injectAliasIntoNativeList, 200);
    });

    console.log('[Persona Manager Pro] loaded (alias only in Persona UI, accountStorage)');
});
