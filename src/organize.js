import { state, saveSettingsLocal } from './state.js';

const kinds = [
    ['categories', '分类', 'categoryMap', 'categoryDefs'],
    ['tags', '标签', 'tagMap', 'tagDefs'],
];
const members = value => Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
function readOperation(operation, label, definitions) {
    const { mode = 'add' } = operation;
    if (!['add', 'remove', 'replace', 'clear', 'delete'].includes(mode)) throw new Error('请选择有效的' + label + '处理方式。');
    const ids = mode === 'clear' ? [] : [...new Set((operation.ids || []).map(String).filter(Boolean))];
    if (mode !== 'clear' && !ids.length) throw new Error('请至少选择一个' + label + '。');
    const valid = new Set(definitions.map(item => item.id));
    if (ids.some(id => !valid.has(id))) throw new Error('有' + label + '已被删除，请重新打开整理窗口。');
    return { mode, ids };
}

/** Describe global deletion for review; reading this never changes assignments. */
export function previewOrganizeDeletion(operations) {
    const items = [], affectedIds = new Set();
    for (const [kind, label, mapKey, defsKey] of kinds) {
        if (operations[kind]?.mode !== 'delete') continue;
        const definitions = state.settings[defsKey] || [];
        const { ids } = readOperation(operations[kind], label, definitions);
        const chosen = new Set(ids);
        const names = definitions.filter(item => chosen.has(item.id)).map(item => item.name);
        const people = Object.keys(state.settings[mapKey] || {}).filter(id => members(state.settings[mapKey][id]).some(value => chosen.has(value)));
        people.forEach(id => affectedIds.add(id));
        items.push({ kind, label, names, count: ids.length });
    }
    return { items, affectedIds: [...affectedIds] };
}

/** Plan both kinds before committing, so a failure cannot save only half a batch. */
export function applyOrganizeBatch(personaIds, operations = {}) {
    const people = [...new Set(personaIds.map(String).filter(Boolean))];
    if (!people.length && !Object.values(operations).some(operation => operation?.mode === 'delete')) throw new Error('请先选择人设。');
    if (people.some(id => ['__proto__', 'constructor', 'prototype'].includes(id))) throw new Error('人设标识无效。');
    const plans = [], changedPeople = new Set(), counts = { categories: 0, tags: 0, deletedCategories: 0, deletedTags: 0 };
    const deleted = { categories: new Set(), tags: new Set() };
    const plan = (key, next) => plans.push({ key, next, previous: state.settings[key], existed: Object.prototype.hasOwnProperty.call(state.settings, key) });
    for (const [kind, label, mapKey, defsKey] of kinds) {
        const operation = operations[kind];
        if (!operation) continue;
        const definitions = state.settings[defsKey] || [];
        const { mode, ids } = readOperation(operation, label, definitions);
        if (mode !== 'delete' && !people.length) throw new Error('请先选择人设。');
        const selected = new Set(ids);
        const previous = state.settings[mapKey], next = { ...(previous || {}) };
        const targets = mode === 'delete' ? Object.keys(previous || {}) : people;
        for (const person of targets) {
            const current = members(previous?.[person]);
            const values = mode === 'add' ? [...new Set([...current, ...ids])]
                : mode === 'remove' || mode === 'delete' ? current.filter(id => !selected.has(id))
                : mode === 'replace' ? [...ids] : [];
            if (current.length === values.length && current.every(id => values.includes(id))) continue;
            changedPeople.add(person); counts[kind]++;
            if (values.length) next[person] = values; else delete next[person];
        }
        if (counts[kind]) plan(mapKey, next);
        if (mode === 'delete') {
            deleted[kind] = selected;
            counts[kind === 'categories' ? 'deletedCategories' : 'deletedTags'] = ids.length;
            plan(defsKey, definitions.filter(item => !selected.has(item.id)));
        }
    }
    if (!plans.length) return { changed: 0, ...counts };
    for (const entry of plans) state.settings[entry.key] = entry.next;
    if (!saveSettingsLocal()) {
        for (const entry of plans) {
            if (entry.existed) state.settings[entry.key] = entry.previous;
            else delete state.settings[entry.key];
        }
        throw new Error('整理未能保存，请检查浏览器存储空间后重试。');
    }
    if (deleted.categories.has(state.filterCategoryId)) state.filterCategoryId = null;
    if (deleted.tags.has(state.filterTagId)) state.filterTagId = null;
    return { changed: changedPeople.size, ...counts };
}
