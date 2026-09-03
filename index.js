import { getContext, extension_settings } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { getThumbnailUrl } from '../../../personas.js';

const EXT = 'persona-manager-pro';
const STORAGE_KEY = 'persona-manager-pro-data';

let pmpData = {
    aliases: {},
    preferNicknames: true,
};

let personaObserver = null;
let injectTimer = null;

/**
 * 获取 SillyTavern 当前上下文里的 accountStorage。
 * 不能直接使用全局 accountStorage：它不是 window 全局变量。
 */
function getAccountStorage() {
    try {
        const context = getContext();
        return context?.accountStorage ?? null;
    } catch (error) {
        console.error(`[${EXT}] 获取 accountStorage 失败`, error);
        return null;
    }
}

function loadData() {
    const storage = getAccountStorage();

    if (!storage) {
        console.warn(`[${EXT}] accountStorage 不可用，暂时使用 localStorage`);
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { aliases: {}, preferNicknames: true };
        } catch {
            return { aliases: {}, preferNicknames: true };
        }
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        return {
            aliases: data?.aliases && typeof data.aliases === 'object' ? data.aliases : {},
            preferNicknames: data?.preferNicknames !== false,
        };
    } catch (error) {
        console.error(`[${EXT}] 读取数据失败`, error);
        return { aliases: {}, preferNicknames: true };
    }
}

function saveData(data) {
    const storage = getAccountStorage();
    const serialized = JSON.stringify({
        aliases: data.aliases || {},
        preferNicknames: data.preferNicknames !== false,
    });

    try {
        if (storage) {
            storage.setItem(STORAGE_KEY, serialized);
        } else {
            localStorage.setItem(STORAGE_KEY, serialized);
        }
        return true;
    } catch (error) {
        console.error(`[${EXT}] 保存数据失败`, error);
        toastr.error('Persona Manager：别名保存失败');
        return false;
    }
}

function getOfficialNickname(avatarId) {
    try {
        const nick = extension_settings?.nicknames;
        const entry = nick?.personas?.[avatarId];

        if (typeof entry === 'string') return entry.trim() || null;
        if (entry?.global) return String(entry.global).trim() || null;
        if (entry?.nickname) return String(entry.nickname).trim() || null;

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
    const personas = power_user?.personas || {};
    const descriptions = power_user?.persona_descriptions || {};

    return Object.keys(personas).map((avatarId) => {
        const name = String(personas[avatarId] || '[Unnamed Persona]');
        const d = descriptions[avatarId] || {};

        return {
            avatarId,
            name,
            displayName: getDisplayName(avatarId, name),
            alias: pmpData.aliases[avatarId] || '',
            officialNickname: getOfficialNickname(avatarId),
            description: String(d.description || ''),
            title: String(d.title || ''),
            thumb: getThumbnailUrl('persona', avatarId),
        };
    });
}

function groupByName() {
    const map = new Map();

    for (const persona of getAllPersonas()) {
        if (!map.has(persona.name)) {
            map.set(persona.name, []);
        }
        map.get(persona.name).push(persona);
    }

    return [...map.entries()].filter(([, list]) => list.length > 1);
}

function findContentDuplicates() {
    const map = new Map();

    for (const persona of getAllPersonas()) {
        const description = persona.description.trim();
        const title = persona.title.trim();

        if (!description && !title) continue;

        const key = `${description}\u0000${title}`;

        if (!map.has(key)) {
            map.set(key, []);
        }

        map.get(key).push(persona);
    }

    return [...map.values()].filter((list) => list.length > 1);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}

function renderDiff(textA, textB) {
    const linesA = String(textA || '').split('\n');
    const linesB = String(textB || '').split('\n');
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

/**
 * 给 Persona 列表顶部加入扩展工具栏。
 * 不再依赖 #persona-management-button / #rm_extensions_block 等旧选择器。
 */
function injectToolbar() {
    const $block = $('#user_avatar_block');

    if (!$block.length) return false;

    if ($('#pmp-toolbar').length) return true;

    const $toolbar = $(`
        <div id="pmp-toolbar" class="pmp-toolbar">
            <div class="pmp-toolbar-title">
                <i class="fa-solid fa-id-card"></i>
                <span>Persona Manager</span>
            </div>
            <button id="pmp-open-btn" class="menu_button pmp-open-btn" type="button">
                <i class="fa-solid fa-code-compare"></i>
                <span>Persona 对比 / 重复检测</span>
            </button>
        </div>
    `);

    // #user_avatar_block 本身是 Persona 卡片容器，因此 toolbar 也作为它的第一个子项。
    // CSS 用 grid-column / flex-basis 让它独占一行。
    $block.prepend($toolbar);

    return true;
}

/**
 * 给每张原生 Persona 卡片增加二次别名。
 * 当前 ST 的真实结构是 .avatar-container[data-avatar-id].
 */
function injectAliasIntoNativeList() {
    const $block = $('#user_avatar_block');

    if (!$block.length) return 0;

    let count = 0;

    $block.find('.avatar-container[data-avatar-id]').each(function () {
        const $card = $(this);
        const avatarId = String($card.attr('data-avatar-id') || '').trim();

        if (!avatarId || $card.find('.pmp-alias-inline').length) {
            return;
        }

        const currentAlias = pmpData.aliases[avatarId] || '';

        const $alias = $(`
            <div class="pmp-alias-inline" data-pmp-id="${escapeAttribute(avatarId)}">
                <label class="pmp-alias-label" title="只用于 Persona 管理界面区分，不会修改 Persona 原名">
                    二次别名
                </label>
                <input
                    type="text"
                    class="text_pole pmp-alias-input-native"
                    data-id="${escapeAttribute(avatarId)}"
                    value="${escapeAttribute(currentAlias)}"
                    placeholder="例如：金发版 / 工作版"
                    autocomplete="off"
                    spellcheck="false"
                >
            </div>
        `);

        // 当前 ST 的 Persona 卡片有 .character_select_container。
        // 放在这个内容区末尾，比直接 append 到卡片最稳定。
        const $content = $card.find('.character_select_container').first();

        if ($content.length) {
            $content.append($alias);
        } else {
            $card.append($alias);
        }

        count++;
    });

    return count;
}

function saveAlias(id, value) {
    const avatarId = String(id || '').trim();
    const alias = String(value || '').trim();

    if (!avatarId) return;

    if (alias) {
        pmpData.aliases[avatarId] = alias;
    } else {
        delete pmpData.aliases[avatarId];
    }

    if (saveData(pmpData)) {
        $(document).trigger('pmp:alias-saved', { avatarId, alias });
    }
}

function bindEvents() {
    // 命名空间事件，避免扩展重复加载后绑定多次。
    $(document).off('.personaManagerPro');

    $(document).on('click.personaManagerPro', '#pmp-open-btn', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openManagerPopup();
    });

    $(document).on('click.personaManagerPro', '.pmp-alias-inline, .pmp-alias-inline *', (event) => {
        event.stopPropagation();
    });

    $(document).on('mousedown.personaManagerPro', '.pmp-alias-input-native', (event) => {
        event.stopPropagation();
    });

    $(document).on('change.personaManagerPro blur.personaManagerPro', '.pmp-alias-input-native', function () {
        saveAlias($(this).attr('data-id'), $(this).val());
    });
}

function openManagerPopup() {
    $('#pmp-popup').remove();

    const $popup = $(`
        <div id="pmp-popup" class="pmp-popup" role="dialog" aria-modal="true">
            <div class="pmp-header">
                <div class="pmp-title-wrap">
                    <h3>Persona Manager</h3>
                    <span class="pmp-count"></span>
                </div>
                <div class="pmp-tabs">
                    <button class="pmp-tab active" type="button" data-tab="same">同名对比</button>
                    <button class="pmp-tab" type="button" data-tab="dup">内容重复</button>
                </div>
                <button class="pmp-close menu_button" type="button" aria-label="关闭">×</button>
            </div>
            <div class="pmp-body">
                <div class="pmp-panel" id="pmp-same"></div>
                <div class="pmp-panel" id="pmp-dup" style="display:none;"></div>
            </div>
        </div>
    `);

    $('body').append($popup);
    $popup.find('.pmp-count').text(`共 ${getAllPersonas().length} 个 Persona`);

    renderSameNamePanel($popup);
    renderDupPanel($popup);

    $popup.on('click', '.pmp-close', () => $popup.remove());

    $popup.on('click', '.pmp-tab', function () {
        const tab = $(this).data('tab');

        $popup.find('.pmp-tab').removeClass('active');
        $(this).addClass('active');

        $popup.find('.pmp-panel').hide();
        $popup.find(`#pmp-${tab}`).show();
    });

    $popup.on('click', (event) => {
        if (event.target === $popup[0]) {
            $popup.remove();
        }
    });
}

function renderPersonaMiniCard(persona, withCheckbox = false) {
    return `
        <div class="pmp-card" data-id="${escapeAttribute(persona.avatarId)}">
            <img src="${escapeAttribute(persona.thumb)}" class="pmp-avatar" alt="">
            <div class="pmp-info">
                <div class="pmp-name">${escapeHtml(persona.displayName)}</div>
                <div class="pmp-id">${escapeHtml(persona.avatarId)}</div>
                <div class="pmp-title">${escapeHtml(persona.title || '（无标题）')}</div>
                ${persona.alias ? `<div class="pmp-alias-readonly">二次别名：${escapeHtml(persona.alias)}</div>` : ''}
            </div>
            ${withCheckbox ? `
                <label class="checkbox_label pmp-checkbox-label">
                    <input type="checkbox" class="pmp-select">
                    <span>对比</span>
                </label>
            ` : ''}
        </div>
    `;
}

function renderSameNamePanel($popup) {
    const $panel = $popup.find('#pmp-same').empty();
    const groups = groupByName();

    if (!groups.length) {
        $panel.html(`
            <div class="pmp-empty">
                <i class="fa-solid fa-circle-check"></i>
                <div>没有发现同名 Persona</div>
            </div>
        `);
        return;
    }

    groups.forEach(([name, list], index) => {
        const groupId = `pmp-group-${index}`;

        const $group = $(`
            <section class="pmp-group" id="${groupId}">
                <div class="pmp-group-title">
                    <span>同名：<b>${escapeHtml(name)}</b></span>
                    <span class="pmp-group-count">${list.length} 个</span>
                </div>
                <div class="pmp-cards"></div>
                <div class="pmp-group-actions">
                    <button type="button" class="menu_button pmp-do-compare">对比选中</button>
                    <button type="button" class="menu_button pmp-select-all">全选</button>
                </div>
                <div class="pmp-compare-area" style="display:none;"></div>
            </section>
        `);

        list.forEach((persona) => {
            $group.find('.pmp-cards').append(renderPersonaMiniCard(persona, true));
        });

        $group.on('click', '.pmp-select-all', function () {
            const $checks = $group.find('.pmp-select');
            const checked = $checks.filter(':checked').length !== $checks.length;
            $checks.prop('checked', checked);
        });

        $group.on('click', '.pmp-do-compare', function () {
            const selected = [];

            $group.find('.pmp-select:checked').each(function () {
                const id = String($(this).closest('.pmp-card').data('id'));
                const persona = list.find((item) => item.avatarId === id);
                if (persona) selected.push(persona);
            });

            if (selected.length < 2) {
                toastr.warning('请至少选择两个 Persona 进行对比');
                return;
            }

            const [a, b] = selected;
            const $area = $group.find('.pmp-compare-area');

            $area.html(`
                <div class="pmp-diff-header">
                    <div>
                        <span class="pmp-diff-label">A</span>
                        <b>${escapeHtml(a.displayName)}</b>
                        <span class="pmp-id">${escapeHtml(a.avatarId)}</span>
                    </div>
                    <div>
                        <span class="pmp-diff-label">B</span>
                        <b>${escapeHtml(b.displayName)}</b>
                        <span class="pmp-id">${escapeHtml(b.avatarId)}</span>
                    </div>
                </div>
                <div class="pmp-diff-body">
                    <div class="pmp-diff-col">
                        <h4>描述</h4>
                        ${renderDiff(a.description, b.description)}
                    </div>
                    <div class="pmp-diff-col">
                        <h4>标题</h4>
                        ${renderDiff(a.title, b.title)}
                    </div>
                </div>
            `).show();
        });

        $panel.append($group);
    });
}

function renderDupPanel($popup) {
    const $panel = $popup.find('#pmp-dup').empty();
    const duplicates = findContentDuplicates();

    if (!duplicates.length) {
        $panel.html(`
            <div class="pmp-empty">
                <i class="fa-solid fa-circle-check"></i>
                <div>没有发现描述 + 标题完全相同的 Persona</div>
            </div>
        `);
        return;
    }

    duplicates.forEach((list, index) => {
        const $group = $(`
            <section class="pmp-group">
                <div class="pmp-group-title">
                    <span>重复组 #${index + 1}</span>
                    <span class="pmp-group-count">${list.length} 个</span>
                </div>
                <div class="pmp-cards"></div>
            </section>
        `);

        list.forEach((persona) => {
            $group.find('.pmp-cards').append(renderPersonaMiniCard(persona, false));
        });

        $panel.append($group);
    });
}

function scheduleInject() {
    clearTimeout(injectTimer);

    injectTimer = setTimeout(() => {
        injectToolbar();
        injectAliasIntoNativeList();
    }, 80);
}

function watchPersonaList() {
    const target = document.getElementById('user_avatar_block');

    if (!target) return false;

    if (personaObserver) {
        personaObserver.disconnect();
    }

    personaObserver = new MutationObserver((mutations) => {
        // 只在原生 Persona 卡片被添加/删除时处理，避免自己插入输入框造成无意义循环。
        const relevant = mutations.some((mutation) =>
            [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
                if (!(node instanceof Element)) return false;
                return node.matches('.avatar-container') ||
                    node.querySelector?.('.avatar-container');
            })
        );

        if (relevant) {
            scheduleInject();
        }
    });

    personaObserver.observe(target, {
        childList: true,
        subtree: true,
    });

    return true;
}

function waitForPersonaList() {
    const tryInit = () => {
        if (!document.getElementById('user_avatar_block')) {
            setTimeout(tryInit, 300);
            return;
        }

        scheduleInject();
        watchPersonaList();
    };

    tryInit();
}

function bindPersonaEvents() {
    if (!eventSource || !event_types) return;

    const events = [
        event_types.PERSONA_CHANGED,
        event_types.PERSONA_CREATED,
        event_types.PERSONA_DELETED,
    ].filter(Boolean);

    for (const eventName of events) {
        eventSource.on(eventName, () => {
            setTimeout(() => {
                pmpData = loadData();
                scheduleInject();
            }, 150);
        });
    }
}

async function init() {
    try {
        pmpData = loadData();

        bindEvents();
        bindPersonaEvents();
        waitForPersonaList();

        console.log(`[${EXT}] loaded`);
        console.log(`[${EXT}] accountStorage:`, !!getAccountStorage());
    } catch (error) {
        console.error(`[${EXT}] 初始化失败`, error);
        toastr.error(`Persona Manager 初始化失败：${error?.message || error}`);
    }
}

jQuery(async () => {
    await init();
});
