import { createCategory, getCategoryDefs, getCategoryMap } from '../categories.js';
import { createTag, getTagDefs, getTagMap } from '../tags.js';
import { TAG_COLOR_PRESETS } from '../constants.js';
import { applyOrganizeBatch, previewOrganizeDeletion } from '../organize.js';
import { getPersonaData } from '../persona-data.js';
import { escapeHtml, computeReadableInk } from '../util.js';
import { createStudioDialog } from './dialog.js';

export function openBatchOrganize(personaIds, afterApply = () => {}, { initialKind = 'categories' } = {}) {
    const live = new Set(getPersonaData().map(person => person.id));
    const ids = [...new Set(personaIds.map(String))].filter(id => live.has(id));
    if (!ids.length) return;
    let active = initialKind === 'tags' ? 'tags' : 'categories';
    const drafts = {
        categories: { chosen: new Set(), mode: 'add', name: '' },
        tags: { chosen: new Set(), mode: 'add', name: '', color: TAG_COLOR_PRESETS[getTagDefs().length % TAG_COLOR_PRESETS.length] },
    };
    const label = kind => kind === 'tags' ? '标签' : '分类';
    const verbs = { add: '添加', remove: '移除', replace: '替换', clear: '清空', delete: '彻底删除' };
    const hasOperation = kind => drafts[kind].mode === 'clear' || drafts[kind].chosen.size > 0;
    const dialogId = 'pmp18-organize-' + Math.random().toString(36).slice(2);
    const dialog = createStudioDialog({
        className: 'pmp18-batch-organize-overlay',
        title: '批量整理',
        subtitle: '已选 ' + ids.length + ' 个人设',
        body: '<div class="pmp18-batch-tabs" role="tablist" aria-label="整理类型">' + ['categories', 'tags'].map(kind => '<button type="button" id="' + dialogId + '-' + kind + '" role="tab" data-batch-kind="' + kind + '" aria-controls="' + dialogId + '-panel"><span>' + label(kind) + '</span><small data-batch-badge></small></button>').join('') + '</div><section id="' + dialogId + '-panel" data-batch-panel role="tabpanel"></section>',
        footer: '<span class="pmp18-save-status" data-batch-summary role="status" aria-live="polite"></span><div class="pmp18-footer-actions"><button type="button" class="pmp18-small-btn" data-close>取消</button><button type="button" class="pmp18-primary-btn" data-batch-apply>应用整理</button></div>',
    });
    const { overlay } = dialog;
    const tabs = [...overlay.querySelectorAll('[data-batch-kind]')];
    const panel = overlay.querySelector('[data-batch-panel]');
    const apply = overlay.querySelector('[data-batch-apply]');
    const refreshSummary = () => {
        for (const tab of tabs) {
            const kind = tab.dataset.batchKind, draft = drafts[kind];
            tab.setAttribute('aria-selected', String(kind === active));
            tab.tabIndex = kind === active ? 0 : -1;
            tab.querySelector('[data-batch-badge]').textContent = hasOperation(kind) ? draft.mode === 'clear' ? '清空' : verbs[draft.mode] + ' ' + draft.chosen.size : '';
        }
        const pending = ['categories', 'tags'].filter(hasOperation);
        const deleting = pending.some(kind => drafts[kind].mode === 'delete');
        apply.disabled = !pending.length;
        apply.classList.toggle('pmp18-danger-btn', deleting);
        apply.textContent = deleting ? '确认整理' : '应用整理';
        overlay.querySelector('[data-batch-summary]').textContent = pending.length
            ? pending.map(kind => label(kind) + '：' + verbs[drafts[kind].mode] + (drafts[kind].mode === 'clear' ? '' : ' ' + drafts[kind].chosen.size + ' 项') + (drafts[kind].mode === 'delete' ? '（全库）' : '')).join(' · ')
            : '选择分类或标签后，一次应用到所选人设';
    };
    const paint = () => {
        const draft = drafts[active], noun = label(active);
        const defs = active === 'tags' ? getTagDefs() : getCategoryDefs();
        const map = active === 'tags' ? getTagMap() : getCategoryMap();
        panel.setAttribute('aria-labelledby', dialogId + '-' + active);
        const hints = {
            add: '为每个人设添加所选' + noun + '，保留各自已有的' + noun + '。',
            remove: '只从这 ' + ids.length + ' 个所选人设移除勾选的' + noun + '；' + noun + '本身和其他人设上的标记保留。',
            replace: '每个人设都只保留勾选的' + noun + '，原有的其他' + noun + '会移除。',
            clear: '移除这 ' + ids.length + ' 个人设的全部' + noun + '；' + noun + '本身仍保留。',
            delete: '彻底删除勾选的' + noun + '本身，并从全库清除对应标记，包括未选中的人设。应用前会列出影响范围供确认。',
        };
        const items = defs.map(item => {
            const count = draft.mode === 'delete'
                ? Object.values(map).filter(value => (Array.isArray(value) ? value : [value]).includes(item.id)).length
                : ids.filter(id => (map[id] || []).includes(item.id)).length;
            const color = /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : TAG_COLOR_PRESETS[0];
            const chip = active === 'tags' ? '<span class="pmp18-tag-chip" style="--pmp-tag:' + color + ';color:' + computeReadableInk(color) + '">' + escapeHtml(item.name) + '</span>' : '<span>' + escapeHtml(item.name) + '</span>';
            return '<label class="pmp18-tag-pick"><input type="checkbox" data-batch-item-id="' + escapeHtml(item.id) + '" ' + (draft.chosen.has(item.id) ? 'checked' : '') + '>' + chip + '<small>' + (draft.mode === 'delete' ? '全库 ' + count + ' 人使用' : count + '/' + ids.length + ' 人已有') + '</small></label>';
        }).join('') || '<p class="pmp18-muted">还没有' + noun + '，可以在下方新建。</p>';
        const modes = [
            ['add', '添加' + noun + ' · 保留已有' + noun],
            ['remove', '从所选人设移除' + noun],
            ['replace', '替换所选人设的' + noun],
            ['clear', '清空所选人设的' + noun],
            ['delete', '彻底删除' + noun + '（全库）'],
        ];
        const options = modes.map(([value, text]) => '<option value="' + value + '">' + text + '</option>').join('');
        panel.innerHTML = '<label class="pmp18-batch-mode">处理方式<select data-batch-mode>' + options + '</select></label><div class="pmp18-org-list" data-batch-list ' + (draft.mode === 'clear' ? 'hidden' : '') + '>' + items + '</div><div class="pmp18-batch-new" ' + (['clear', 'delete'].includes(draft.mode) ? 'hidden' : '') + '><div class="pmp18-batch-create"><input type="text" data-batch-name placeholder="新建' + noun + '" maxlength="24" aria-label="新' + noun + '名称"><button type="button" class="pmp18-small-btn" data-batch-create>添加</button></div>' + (active === 'tags' ? '<label class="pmp18-batch-color">新标签颜色<input type="color" data-batch-color aria-label="新标签颜色" value="' + draft.color + '"></label>' : '') + '</div><p class="pmp18-field-hint" data-batch-hint>' + (draft.mode === 'delete' ? '<strong>' + hints[draft.mode] + '</strong>' : hints[draft.mode]) + '</p>';
        panel.querySelector('[data-batch-mode]').value = draft.mode;
        panel.querySelector('[data-batch-name]').value = draft.name;
        refreshSummary();
    };
    const activate = kind => { active = kind; dialog.error(); paint(); };
    tabs.forEach((tab, index) => {
        tab.onclick = () => activate(tab.dataset.batchKind);
        tab.onkeydown = event => {
            let next;
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = tabs[1 - index];
            else if (event.key === 'Home') next = tabs[0];
            else if (event.key === 'End') next = tabs[1];
            if (!next) return;
            event.preventDefault(); activate(next.dataset.batchKind); next.focus({ preventScroll: true });
        };
    });
    const create = () => {
        const draft = drafts[active], name = draft.name.trim();
        if (!name) { panel.querySelector('[data-batch-name]').focus(); return; }
        let item;
        try { item = active === 'tags' ? createTag(name, draft.color) : createCategory(name); }
        catch (error) { dialog.error(error.message); return; }
        if (!item) { dialog.error(label(active) + '名无效或已存在。'); return; }
        draft.chosen.add(item.id); draft.name = ''; dialog.error(); paint();
        try { window.__pmp18NativeTags?.refresh?.(); } catch {}
    };
    panel.addEventListener('change', event => {
        const draft = drafts[active], input = event.target;
        if (input.matches('[data-batch-item-id]')) {
            if (input.checked) draft.chosen.add(input.dataset.batchItemId); else draft.chosen.delete(input.dataset.batchItemId);
            refreshSummary();
        } else if (input.matches('[data-batch-mode]')) { draft.mode = input.value; dialog.error(); paint(); }
        else if (input.matches('[data-batch-color]')) drafts.tags.color = input.value;
    });
    panel.addEventListener('input', event => {
        if (event.target.matches('[data-batch-name]')) drafts[active].name = event.target.value;
        if (event.target.matches('[data-batch-color]')) drafts.tags.color = event.target.value;
    });
    panel.addEventListener('click', event => { if (event.target.closest('[data-batch-create]')) create(); });
    panel.addEventListener('keydown', event => { if (event.target.matches('[data-batch-name]') && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); create(); } });
    apply.onclick = () => {
        if (apply.disabled) return;
        const current = new Set(getPersonaData().map(person => person.id));
        if (ids.some(id => !current.has(id))) { dialog.error('部分人设已被移除，请关闭窗口后重新选择。'); return; }
        try {
            const operations = {};
            for (const kind of ['categories', 'tags']) if (hasOperation(kind)) {
                operations[kind] = { mode: drafts[kind].mode, ids: [...drafts[kind].chosen] };
            }
            const preview = previewOrganizeDeletion(operations);
            if (preview.items.length) {
                const selected = new Set(ids);
                const unselected = preview.affectedIds.filter(id => !selected.has(id)).length;
                const names = preview.items.map(item => item.label + '：' + item.names.slice(0, 8).map(name => '「' + name + '」').join('、') + (item.count > 8 ? ' 等 ' + item.count + ' 项' : '')).join('\n');
                const message = '将彻底删除以下分类／标签，并从全库清除其标记（包括未选中的人设）：\n\n' + names + '\n\n涉及全库 ' + preview.affectedIds.length + ' 个人设，其中 ' + unselected + ' 个未选中。\n人设本身和正文保留，其他待应用的整理操作会一起保存。\n\n确定继续？';
                if (!window.confirm(message)) return;
            }
            const result = applyOrganizeBatch(ids, operations);
            try { window.__pmp18NativeTags?.refresh?.(); } catch {}
            dialog.close(true); afterApply();
            if (typeof toastr !== 'undefined') {
                const deleted = [];
                if (result.deletedCategories) deleted.push(result.deletedCategories + ' 个分类');
                if (result.deletedTags) deleted.push(result.deletedTags + ' 个标签');
                toastr.success(deleted.length ? '整理完成，已彻底删除 ' + deleted.join('、') : result.changed ? '已整理 ' + result.changed + ' 个人设' : '所选人设已符合这些设置');
            }
        } catch (error) { dialog.error(error.message); }
    };
    paint();
    return overlay;
}
