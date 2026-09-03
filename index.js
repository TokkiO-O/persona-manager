/**
 * Persona Manager v1.3.0
 * SillyTavern third-party extension
 *
 * No secondary aliases. No Persona data mutation.
 * Reads SillyTavern's native Persona data and provides a dedicated
 * manager for search, same-name grouping, duplicate detection,
 * similarity hints, and multi-Persona comparison.
 */

import { getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';

const EXT = 'Persona Manager';
const VERSION = '1.3.0';
const ROOT_ID = 'pmp13-root';
const BUTTON_ID = 'pmp13-entry';

const state = {
    active: false,
    tab: 'all',
    query: '',
    selected: new Set(),
};

const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const normalizeText = (value = '') => String(value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

function getPersonaData() {
    const personas = power_user?.personas || {};
    const descriptions = power_user?.persona_descriptions || {};

    return Object.entries(personas).map(([id, rawName]) => {
        const name = String(rawName ?? id);
        const description = String(descriptions?.[id] ?? '');
        return {
            id,
            name,
            description,
            nameKey: normalizeText(name),
            descriptionKey: normalizeText(description),
        };
    });
}

function groupBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }
    return [...map.values()];
}

function getSameNameGroups(personas) {
    return groupBy(personas, p => p.nameKey).filter(g => g.length > 1);
}

function getExactDuplicateGroups(personas) {
    return groupBy(personas, p => `${p.nameKey}\u0000${p.descriptionKey}`)
        .filter(g => g.length > 1);
}

function similarity(a, b) {
    const x = normalizeText(a);
    const y = normalizeText(b);
    if (!x || !y) return 0;
    if (x === y) return 1;

    const grams = text => {
        const set = new Set();
        for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
        return set;
    };

    const ax = grams(x);
    const by = grams(y);
    let intersection = 0;
    for (const item of ax) if (by.has(item)) intersection++;

    const union = ax.size + by.size - intersection;
    return union ? intersection / union : 0;
}

function getSimilarPairs(personas, threshold = 0.78) {
    const pairs = [];
    for (let i = 0; i < personas.length; i++) {
        for (let j = i + 1; j < personas.length; j++) {
            const a = personas[i];
            const b = personas[j];
            if (a.nameKey === b.nameKey) continue;

            const score = similarity(a.description, b.description);
            if (score >= threshold) pairs.push({ a, b, score });
        }
    }
    return pairs.sort((a, b) => b.score - a.score);
}

function personaImageUrl(id) {
    try {
        const context = getContext();
        if (typeof context?.getThumbnailUrl === 'function') {
            return context.getThumbnailUrl('persona', id);
        }
    } catch {
        // Avatar display is optional; the manager remains functional.
    }
    return '';
}

function renderAvatar(persona, large = false) {
    const cls = large ? 'pmp13-avatar pmp13-avatar-large' : 'pmp13-avatar';
    const url = personaImageUrl(persona.id);

    if (url) {
        return `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy">`;
    }

    return `<div class="${cls} pmp13-avatar-fallback"><i class="fa-solid fa-user"></i></div>`;
}

function isInGroup(persona, groups) {
    return groups.some(group => group.some(item => item.id === persona.id));
}

function statusBadge(persona, all) {
    if (isInGroup(persona, getExactDuplicateGroups(all))) {
        return '<span class="pmp13-badge pmp13-badge-danger">完全重复</span>';
    }
    if (isInGroup(persona, getSameNameGroups(all))) {
        return '<span class="pmp13-badge">同名</span>';
    }
    return '';
}

function renderCard(persona, all) {
    const checked = state.selected.has(persona.id);
    return `
        <article class="pmp13-card ${checked ? 'is-selected' : ''}" data-persona-id="${escapeHtml(persona.id)}">
            <label class="pmp13-check">
                <input type="checkbox" data-action="select" ${checked ? 'checked' : ''}>
            </label>
            ${renderAvatar(persona)}
            <div class="pmp13-card-main">
                <div class="pmp13-card-title-row">
                    <div class="pmp13-card-name" title="${escapeHtml(persona.name)}">${escapeHtml(persona.name)}</div>
                    ${statusBadge(persona, all)}
                </div>
                <div class="pmp13-card-id">ID：${escapeHtml(persona.id)}</div>
                <div class="pmp13-card-description">
                    ${persona.description
                        ? escapeHtml(persona.description)
                        : '<span class="pmp13-muted">暂无 Persona 描述 / 备注</span>'}
                </div>
            </div>
        </article>
    `;
}

function renderGroup(group, title, all) {
    return `
        <section class="pmp13-group">
            <div class="pmp13-group-head">
                <div>
                    <div class="pmp13-group-title">${escapeHtml(title)}</div>
                    <div class="pmp13-group-count">${group.length} 个 Persona</div>
                </div>
                <button class="pmp13-small-btn" type="button" data-action="select-group"
                        data-ids="${escapeHtml(group.map(x => x.id).join('|'))}">
                    全选此组
                </button>
            </div>
            <div class="pmp13-group-grid">
                ${group.map(persona => renderCard(persona, all)).join('')}
            </div>
        </section>
    `;
}

function emptyState(title, text) {
    return `
        <div class="pmp13-empty">
            <i class="fa-solid fa-magnifying-glass"></i>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(text)}</span>
        </div>
    `;
}

function searchMatch(persona, query) {
    const q = normalizeText(query);
    return !q ||
        normalizeText(persona.name).includes(q) ||
        normalizeText(persona.description).includes(q);
}

function renderAllView(personas) {
    const filtered = personas.filter(p => searchMatch(p, state.query));
    if (!filtered.length) {
        return emptyState(
            state.query ? '没有找到匹配的 Persona' : '这里还没有可显示的 Persona',
            state.query ? '试试搜索名称或描述。' : 'SillyTavern 当前没有读取到 Persona 数据。'
        );
    }
    return `<div class="pmp13-card-grid">${filtered.map(p => renderCard(p, personas)).join('')}</div>`;
}

function renderSameNameView(personas) {
    const groups = getSameNameGroups(personas)
        .map(group => group.filter(p => searchMatch(p, state.query)))
        .filter(group => group.length > 1);

    if (!groups.length) {
        return emptyState('没有发现同名 Persona', '同名检测使用 Persona 原始名称，不使用额外别名。');
    }

    return groups.map(group => renderGroup(group, group[0].name, personas)).join('');
}

function renderDuplicateView(personas) {
    const groups = getExactDuplicateGroups(personas)
        .map(group => group.filter(p => searchMatch(p, state.query)))
        .filter(group => group.length > 1);

    if (!groups.length) {
        return emptyState('没有发现完全重复的 Persona', '判定条件：名称和 Persona 描述都完全一致。');
    }

    return groups.map((group, i) => renderGroup(group, `重复组 ${i + 1}`, personas)).join('');
}

function renderMiniPersona(persona) {
    return `
        <div class="pmp13-mini">
            ${renderAvatar(persona)}
            <div>
                <strong>${escapeHtml(persona.name)}</strong>
                <p>${persona.description ? escapeHtml(persona.description) : '暂无描述'}</p>
            </div>
        </div>
    `;
}

function renderSimilarView(personas) {
    const q = normalizeText(state.query);
    const pairs = getSimilarPairs(personas).filter(({ a, b }) =>
        !q ||
        searchMatch(a, q) ||
        searchMatch(b, q)
    );

    if (!pairs.length) {
        return emptyState(
            '没有发现高度相似 Persona',
            '这是本地文本相似度提示，不会自动修改或删除 Persona。'
        );
    }

    return `
        <div class="pmp13-similar-list">
            ${pairs.map(({ a, b, score }) => `
                <section class="pmp13-similar-pair">
                    <div class="pmp13-similar-head">
                        <span>描述相似度 ${Math.round(score * 100)}%</span>
                        <button class="pmp13-small-btn" data-action="compare-pair"
                                data-a="${escapeHtml(a.id)}" data-b="${escapeHtml(b.id)}">
                            对比
                        </button>
                    </div>
                    <div class="pmp13-compare-mini">
                        ${renderMiniPersona(a)}
                        ${renderMiniPersona(b)}
                    </div>
                </section>
            `).join('')}
        </div>
    `;
}

function renderComparePanel(personas) {
    const selected = personas.filter(p => state.selected.has(p.id));
    if (selected.length < 2) return '';

    return `
        <div class="pmp13-compare-drawer">
            <div class="pmp13-compare-drawer-head">
                <div>
                    <strong>Persona 对比</strong>
                    <span>已选择 ${selected.length} 个</span>
                </div>
                <button class="pmp13-icon-btn" data-action="clear-selection" title="清除选择">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="pmp13-compare-columns">
                ${selected.map(persona => `
                    <div class="pmp13-compare-column">
                        ${renderAvatar(persona, true)}
                        <h3>${escapeHtml(persona.name)}</h3>
                        <div class="pmp13-compare-text">
                            ${escapeHtml(persona.description || '暂无描述 / 备注')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function tabButton(key, label, icon, count) {
    return `
        <button class="pmp13-tab ${state.tab === key ? 'is-active' : ''}"
                type="button" data-action="tab" data-tab="${key}">
            <i class="fa-solid ${icon}"></i>
            <span>${label}</span>
            ${typeof count === 'number' ? `<em>${count}</em>` : ''}
        </button>
    `;
}

function renderManager() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const personas = getPersonaData();
    const sameNameGroups = getSameNameGroups(personas);
    const duplicateGroups = getExactDuplicateGroups(personas);
    const similarPairs = getSimilarPairs(personas);

    root.innerHTML = `
        <div class="pmp13-backdrop" data-action="close"></div>
        <section class="pmp13-window" role="dialog" aria-modal="true" aria-label="Persona Manager">
            <header class="pmp13-header">
                <div class="pmp13-brand">
                    <div class="pmp13-brand-icon"><i class="fa-solid fa-users-viewfinder"></i></div>
                    <div>
                        <h1>Persona Manager</h1>
                        <span>整理、识别与对比你的 Persona</span>
                    </div>
                </div>
                <button class="pmp13-close" type="button" data-action="close" aria-label="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </header>

            <div class="pmp13-toolbar">
                <div class="pmp13-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="pmp13-search" type="search" value="${escapeHtml(state.query)}"
                           placeholder="搜索 Persona 名称或描述…" autocomplete="off">
                    ${state.query ? '<button data-action="clear-search" title="清除"><i class="fa-solid fa-xmark"></i></button>' : ''}
                </div>
                <div class="pmp13-stats">
                    <span><b>${personas.length}</b> 全部</span>
                    <span><b>${sameNameGroups.length}</b> 同名组</span>
                    <span><b>${duplicateGroups.length}</b> 重复组</span>
                    <span><b>${similarPairs.length}</b> 相似对</span>
                </div>
            </div>

            <nav class="pmp13-tabs" aria-label="Persona Manager 分类">
                ${tabButton('all', '全部 Persona', 'fa-layer-group')}
                ${tabButton('same-name', '同名 Persona', 'fa-people-group', sameNameGroups.length)}
                ${tabButton('duplicates', '完全重复', 'fa-copy', duplicateGroups.length)}
                ${tabButton('similar', '高度相似', 'fa-clone', similarPairs.length)}
            </nav>

            <main class="pmp13-content">
                ${state.tab === 'all' ? renderAllView(personas)
                    : state.tab === 'same-name' ? renderSameNameView(personas)
                    : state.tab === 'duplicates' ? renderDuplicateView(personas)
                    : renderSimilarView(personas)}
            </main>

            ${renderComparePanel(personas)}
        </section>
    `;

    const input = document.getElementById('pmp13-search');
    if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.hidden = true;
        document.body.appendChild(root);
    }

    if (root.dataset.bound !== '1') {
        root.dataset.bound = '1';

        root.addEventListener('click', event => {
            const target = event.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;

            if (action === 'close') {
                if (target.classList.contains('pmp13-backdrop') || target.classList.contains('pmp13-close')) {
                    closeManager();
                }
                return;
            }

            if (action === 'tab') {
                state.tab = target.dataset.tab || 'all';
                state.selected.clear();
                renderManager();
                return;
            }

            if (action === 'clear-search') {
                state.query = '';
                renderManager();
                return;
            }

            if (action === 'clear-selection') {
                state.selected.clear();
                renderManager();
                return;
            }

            if (action === 'select-group') {
                for (const id of (target.dataset.ids || '').split('|').filter(Boolean)) {
                    state.selected.add(id);
                }
                renderManager();
                return;
            }

            if (action === 'compare-pair') {
                state.selected = new Set([target.dataset.a, target.dataset.b]);
                state.tab = 'all';
                renderManager();
            }
        });

        root.addEventListener('change', event => {
            const input = event.target.closest('input[data-action="select"]');
            if (!input) return;

            const card = input.closest('[data-persona-id]');
            if (!card) return;

            if (input.checked) state.selected.add(card.dataset.personaId);
            else state.selected.delete(card.dataset.personaId);

            renderManager();
        });

        root.addEventListener('input', event => {
            if (event.target.id !== 'pmp13-search') return;
            state.query = event.target.value;
            renderManager();
        });
    }
}

function openManager(tab = 'all') {
    ensureRoot();
    state.active = true;
    state.tab = tab;
    state.selected.clear();

    const root = document.getElementById(ROOT_ID);
    root.hidden = false;
    document.body.classList.add('pmp13-open');
    renderManager();
}

function closeManager() {
    state.active = false;
    state.selected.clear();

    const root = document.getElementById(ROOT_ID);
    if (root) root.hidden = true;
    document.body.classList.remove('pmp13-open');
}

function findEntryAnchor() {
    // The entry belongs beside the native Persona "全局设置" section.
    // Do not attach it to the Persona card list: the manager is a separate tool.
    const candidates = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,label,div,span'))
        .filter(element => element.children.length <= 2)
        .filter(element => element.textContent?.trim() === '全局设置');

    // Prefer the smallest/most direct text node so the button is inserted
    // into the same settings container immediately before the native heading.
    return candidates.find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }) || null;
}

function injectEntry() {
    if (document.getElementById(BUTTON_ID)) return true;

    const anchor = findEntryAnchor();
    if (!anchor) return false;

    const entry = document.createElement('button');
    entry.id = BUTTON_ID;
    entry.type = 'button';
    entry.className = 'menu_button pmp13-entry';
    entry.innerHTML = `
        <i class="fa-solid fa-users-viewfinder"></i>
        <span>Persona Manager</span>
        <small>管理 / 对比 / 重复检测</small>
    `;
    entry.addEventListener('click', () => openManager('all'));

    anchor.parentNode?.insertBefore(entry, anchor);
    return true;
}

function installEntryObserver() {
    const observer = new MutationObserver(() => {
        if (!document.getElementById(BUTTON_ID)) injectEntry();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function installKeyboardHandler() {
    document.addEventListener('keydown', event => {
        if (!state.active) return;

        if (event.key === 'Escape') {
            closeManager();
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            const input = document.getElementById('pmp13-search');
            if (input) {
                event.preventDefault();
                input.focus();
            }
        }
    });
}

async function init() {
    ensureRoot();
    injectEntry();
    installEntryObserver();
    installKeyboardHandler();

    console.log(`[${EXT}] v${VERSION} loaded`);
}

(async () => {
    try {
        await init();
    } catch (error) {
        console.error(`[${EXT}] 初始化失败`, error);
        if (typeof toastr !== 'undefined') {
            toastr.error(`${EXT} 初始化失败：${error?.message || error}`);
        }
    }
})();
