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
 * accountStorage 不是 window 全局变量，必须从 getContext() 获取。
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

/**
 * 读取扩展数据
 */
function loadData() {
    const storage = getAccountStorage();

    if (!storage) {
        console.warn(`[${EXT}] accountStorage 不可用，暂时使用 localStorage`);

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw
                ? JSON.parse(raw)
                : { aliases: {}, preferNicknames: true };
        } catch (error) {
            console.error(`[${EXT}] localStorage 读取失败`, error);
            return { aliases: {}, preferNicknames: true };
        }
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);

        if (!raw) {
            return {
                aliases: {},
                preferNicknames: true,
            };
        }

        return typeof raw === 'string'
            ? JSON.parse(raw)
            : raw;
    } catch (error) {
        console.error(`[${EXT}] accountStorage 读取失败`, error);

        return {
            aliases: {},
            preferNicknames: true,
        };
    }
}

/**
 * 保存扩展数据
 */
function saveData() {
    const storage = getAccountStorage();
    const value = JSON.stringify(pmpData);

    if (!storage) {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (error) {
            console.error(`[${EXT}] localStorage 保存失败`, error);
        }
        return;
    }

    try {
        storage.setItem(STORAGE_KEY, value);
    } catch (error) {
        console.error(`[${EXT}] accountStorage 保存失败`, error);
    }
}

/**
 * 获取 Persona 数据
 */
function getAllPersonas() {
    const personas = power_user?.personas || {};
    const descriptions = power_user?.persona_descriptions || {};

    return Object.entries(personas).map(([avatarId, name]) => {
        return {
            avatarId,
            name: name || avatarId,
            description: descriptions?.[avatarId] || '',
            alias: pmpData.aliases?.[avatarId] || '',
        };
    });
}

/**
 * 获取当前 Persona 的显示名称
 */
function getDisplayName(persona) {
    if (!persona) return '';

    const alias = pmpData.aliases?.[persona.avatarId];

    if (alias && alias.trim()) {
        return alias.trim();
    }

    return persona.name || '';
}

/**
 * 给 Persona 卡片添加二次别名输入框
 */
function injectAliasIntoNativeList() {
    const $block = $('#user_avatar_block');

    if (!$block.length) {
        return false;
    }

    const personas = getAllPersonas();

    $block.find('.avatar-container[data-avatar-id]').each(function () {
        const $card = $(this);

        const avatarId = $card.attr('data-avatar-id');

        if (!avatarId) {
            return;
        }

        if ($card.find('.pmp-alias-inline').length) {
            return;
        }

        const persona = personas.find(
            item => item.avatarId === avatarId
        );

        if (!persona) {
            return;
        }

        const $name = $card.find('.ch_name').first();

        const $input = $(`
            <div class="pmp-alias-inline">
                <input
                    type="text"
                    class="pmp-alias-input"
                    placeholder="二次别名"
                    maxlength="100"
                >
            </div>
        `);

        $input.find('input').val(
            pmpData.aliases?.[avatarId] || ''
        );

        if ($name.length) {
            $name.after($input);
        } else {
            $card.append($input);
        }
    });

    return true;
}

/**
 * 插入 Persona Manager 工具栏
 */
function injectToolbar() {
    const $block = $('#user_avatar_block');

    if (!$block.length) {
        return false;
    }

    if ($('#pmp-toolbar').length) {
        return true;
    }

    const $toolbar = $(`
        <div id="pmp-toolbar" class="pmp-toolbar">
            <div class="pmp-toolbar-title">
                <i class="fa-solid fa-id-card"></i>
                <span>Persona Manager</span>
            </div>

            <button
                id="pmp-open-btn"
                class="menu_button pmp-open-btn"
                type="button"
            >
                <i class="fa-solid fa-code-compare"></i>
                <span>Persona 对比 / 重复检测</span>
            </button>
        </div>
    `);

    $block.prepend($toolbar);

    return true;
}

/**
 * 延迟等待 Persona 列表出现
 */
function waitForPersonaList() {
    const tryInject = () => {
        const $block = $('#user_avatar_block');

        if (!$block.length) {
            injectTimer = setTimeout(tryInject, 300);
            return;
        }

        injectToolbar();
        injectAliasIntoNativeList();
    };

    tryInject();
}

/**
 * 绑定别名输入事件
 */
function bindEvents() {
    $(document)
        .off('change.pmp', '.pmp-alias-input')
        .on('change.pmp', '.pmp-alias-input', function (event) {
            event.stopPropagation();

            const $input = $(this);
            const $card = $input.closest('.avatar-container');

            const avatarId = $card.attr('data-avatar-id');

            if (!avatarId) {
                return;
            }

            const value = $input.val().trim();

            if (value) {
                pmpData.aliases[avatarId] = value;
            } else {
                delete pmpData.aliases[avatarId];
            }

            saveData();
        });

    $(document)
        .off('click.pmpOpen', '#pmp-open-btn')
        .on('click.pmpOpen', '#pmp-open-btn', function (event) {
            event.preventDefault();
            event.stopPropagation();

            openManagerPopup();
        });
}

/**
 * 防止别名输入框触发 Persona 选择
 */
function bindPersonaEvents() {
    $(document)
        .off(
            'click.pmpInput',
            '.pmp-alias-inline, .pmp-alias-input'
        )
        .on(
            'click.pmpInput',
            '.pmp-alias-inline, .pmp-alias-input',
            function (event) {
                event.stopPropagation();
            }
        );
}

/**
 * 创建对比窗口
 */
function openManagerPopup() {
    $('#pmp-modal').remove();

    const personas = getAllPersonas();

    const nameGroups = {};

    personas.forEach(persona => {
        const name = persona.name.trim().toLowerCase();

        if (!nameGroups[name]) {
            nameGroups[name] = [];
        }

        nameGroups[name].push(persona);
    });

    const sameNameGroups = Object.values(nameGroups)
        .filter(group => group.length > 1);

    const descriptionGroups = {};

    personas.forEach(persona => {
        const key = `${persona.name}\n${persona.description}`;

        if (!descriptionGroups[key]) {
            descriptionGroups[key] = [];
        }

        descriptionGroups[key].push(persona);
    });

    const duplicateGroups = Object.values(descriptionGroups)
        .filter(group => group.length > 1);

    const $modal = $(`
        <div id="pmp-modal" class="pmp-modal">
            <div class="pmp-modal-overlay"></div>

            <div class="pmp-modal-content">
                <div class="pmp-modal-header">
                    <h3>Persona 对比 / 重复检测</h3>

                    <button
                        type="button"
                        class="pmp-close"
                    >
                        ×
                    </button>
                </div>

                <div class="pmp-modal-body">

                    <section class="pmp-section">
                        <h4>同名 Persona</h4>

                        <div class="pmp-group-list">
                            ${
                                sameNameGroups.length
                                    ? sameNameGroups.map(group => `
                                        <div class="pmp-group">
                                            <div class="pmp-group-title">
                                                ${escapeHtml(group[0].name)}
                                            </div>

                                            ${group.map(persona => `
                                                <div class="pmp-persona-row">
                                                    <span>
                                                        ${escapeHtml(
                                                            getDisplayName(persona)
                                                        )}
                                                    </span>

                                                    <small>
                                                        ${escapeHtml(
                                                            persona.avatarId
                                                        )}
                                                    </small>
                                                </div>
                                            `).join('')}
                                        </div>
                                    `).join('')
                                    : '<div class="pmp-empty">没有发现同名 Persona</div>'
                            }
                        </div>
                    </section>

                    <section class="pmp-section">
                        <h4>重复 Persona</h4>

                        <div class="pmp-group-list">
                            ${
                                duplicateGroups.length
                                    ? duplicateGroups.map(group => `
                                        <div class="pmp-group pmp-duplicate">
                                            <div class="pmp-group-title">
                                                ${escapeHtml(group[0].name)}
                                            </div>

                                            ${group.map(persona => `
                                                <div class="pmp-persona-row">
                                                    <span>
                                                        ${escapeHtml(
                                                            getDisplayName(persona)
                                                        )}
                                                    </span>

                                                    <small>
                                                        ${escapeHtml(
                                                            persona.avatarId
                                                        )}
                                                    </small>
                                                </div>
                                            `).join('')}
                                        </div>
                                    `).join('')
                                    : '<div class="pmp-empty">没有发现完全重复 Persona</div>'
                            }
                        </div>
                    </section>

                </div>
            </div>
        </div>
    `);

    $('body').append($modal);

    $modal.on('click', '.pmp-close, .pmp-modal-overlay', function () {
        $modal.remove();
    });
}

/**
 * HTML 转义
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 监听 Persona 列表变化
 */
function observePersonaList() {
    const block = document.querySelector('#user_avatar_block');

    if (!block) {
        return;
    }

    if (personaObserver) {
        personaObserver.disconnect();
    }

    personaObserver = new MutationObserver(() => {
        clearTimeout(injectTimer);

        injectTimer = setTimeout(() => {
            injectToolbar();
            injectAliasIntoNativeList();
        }, 100);
    });

    personaObserver.observe(block, {
        childList: true,
        subtree: true,
    });
}

/**
 * Persona 相关事件
 */
function bindPersonaChangeEvents() {
    const events = [
        event_types.PERSONA_CHANGED,
        event_types.PERSONA_CREATED,
        event_types.PERSONA_DELETED,
    ];

    events.forEach(eventName => {
        if (!eventName) {
            return;
        }

        eventSource.on(eventName, () => {
            setTimeout(() => {
                injectToolbar();
                injectAliasIntoNativeList();
                observePersonaList();
            }, 200);
        });
    });
}

/**
 * 初始化
 */
async function init() {
    try {
        console.log(`[${EXT}] 开始初始化`);

        pmpData = loadData();

        bindEvents();
        bindPersonaEvents();
        bindPersonaChangeEvents();

        waitForPersonaList();

        setTimeout(() => {
            injectToolbar();
            injectAliasIntoNativeList();
            observePersonaList();
        }, 500);

        console.log(`[${EXT}] loaded`);
        console.log(
            `[${EXT}] accountStorage:`,
            !!getAccountStorage()
        );
    } catch (error) {
        console.error(`[${EXT}] 初始化失败`, error);

        if (typeof toastr !== 'undefined') {
            toastr.error(
                `Persona Manager 初始化失败：${error?.message || error}`
            );
        }
    }
}

/**
 * SillyTavern 第三方扩展可能在 DOM ready 之后才动态加载。
 * 因此这里不要依赖 jQuery ready，模块加载后立即初始化。
 */
(async () => {
    await init();
})();
