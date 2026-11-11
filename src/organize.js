import { state, saveSettingsLocal } from './state.js';

/** Plan both kinds before committing, so a failure cannot save only half a batch. */
export function applyOrganizeBatch(personaIds, operations = {}) {
    const people = [...new Set(personaIds.map(String).filter(Boolean))];
    if (!people.length) throw new Error('请先选择人设。');
    if (people.some(id => ['__proto__', 'constructor', 'prototype'].includes(id))) throw new Error('人设标识无效。');
    const plans = [], changedPeople = new Set(), counts = { categories: 0, tags: 0 };
    for (const [kind, label, mapKey, defsKey] of [
        ['categories', '分类', 'categoryMap', 'categoryDefs'],
        ['tags', '标签', 'tagMap', 'tagDefs'],
    ]) {
        const operation = operations[kind];
        if (!operation) continue;
        const { mode = 'add' } = operation;
        if (!['add', 'remove', 'replace', 'clear'].includes(mode)) throw new Error('请选择有效的' + label + '处理方式。');
        const ids = mode === 'clear' ? [] : [...new Set((operation.ids || []).map(String).filter(Boolean))];
        if (mode !== 'clear' && !ids.length) throw new Error('请至少选择一个' + label + '。');
        const valid = new Set((state.settings[defsKey] || []).map(item => item.id));
        if (ids.some(id => !valid.has(id))) throw new Error('有' + label + '已被删除，请重新打开整理窗口。');
        const previous = state.settings[mapKey], next = { ...(previous || {}) };
        for (const person of people) {
            const raw = previous?.[person];
            const current = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
            const values = mode === 'add' ? [...new Set([...current, ...ids])]
                : mode === 'remove' ? current.filter(id => !ids.includes(id))
                : mode === 'replace' ? [...ids] : [];
            if (current.length === values.length && current.every(id => values.includes(id))) continue;
            changedPeople.add(person); counts[kind]++;
            if (values.length) next[person] = values; else delete next[person];
        }
        if (counts[kind]) plans.push({ mapKey, previous, next, existed: Object.prototype.hasOwnProperty.call(state.settings, mapKey) });
    }
    if (!changedPeople.size) return { changed: 0, ...counts };
    for (const plan of plans) state.settings[plan.mapKey] = plan.next;
    if (!saveSettingsLocal()) {
        for (const plan of plans) {
            if (plan.existed) state.settings[plan.mapKey] = plan.previous;
            else delete state.settings[plan.mapKey];
        }
        throw new Error('整理未能保存，请检查浏览器存储空间后重试。');
    }
    return { changed: changedPeople.size, ...counts };
}
