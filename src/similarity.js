import { state } from './state.js';
import { groupBy, normalizeText } from './util.js';

/* ---------- §5 Grouping & similarity (with module-level memo) ---------- */

// These are cheap when personas count is small, but we still memo per persona
// list identity so back-to-back renders during a click storm don't re-group.
let _groupMemo = null; // { sig, sameName, duplicates, similar }

export function _personaSig(personas) {
    // Cheap content signature: id|descriptionLen|nameLen per entry. If any
    // persona changes, signature changes, memo is invalidated.
    let s = '';
    for (const p of personas) s += `${p.id}|${p.description.length}|${p.name.length};`;
    return s;
}

export function getSameNameGroups(personas) {
    if (_groupMemo && _groupMemo.sig === _personaSig(personas)) return _groupMemo.sameName;
    const groups = groupBy(personas, p => p.nameKey).filter(g => g.length > 1);
    if (!_groupMemo) _groupMemo = { sig: '', sameName: [], duplicates: [], similar: [] };
    _groupMemo.sig = _personaSig(personas);
    _groupMemo.sameName = groups;
    return groups;
}

export function getExactDuplicateGroups(personas) {
    if (_groupMemo && _groupMemo.sig === _personaSig(personas)) return _groupMemo.duplicates;
    const groups = groupBy(personas, p => `${p.nameKey}\u0000${p.descriptionKey}`).filter(g => g.length > 1);
    if (!_groupMemo) _groupMemo = { sig: '', sameName: [], duplicates: [], similar: [] };
    _groupMemo.sig = _personaSig(personas);
    _groupMemo.duplicates = groups;
    return groups;
}

export function getSimilarPairs(personas, threshold = state.settings.similarityThreshold) {
    const allowSameName = state.settings.includeSameNameInSimilar;
    const sig = `${_personaSig(personas)}|t=${threshold}|a=${allowSameName ? 1 : 0}`;
    if (_groupMemo && _groupMemo.similarSig === sig) return _groupMemo.similar;

    const pairs = [];
    for (let i = 0; i < personas.length; i++) {
        for (let j = i + 1; j < personas.length; j++) {
            const a = personas[i];
            const b = personas[j];
            if (!allowSameName && a.nameKey === b.nameKey) continue;
            if (!a.descriptionKey || !b.descriptionKey) continue;
            if (a.descriptionKey === b.descriptionKey && a.nameKey === b.nameKey) continue;
            const score = similarity(a.description, b.description);
            if (score >= threshold) pairs.push({ a, b, score });
        }
    }
    pairs.sort((x, y) => y.score - x.score);
    if (!_groupMemo) _groupMemo = { sig: '', sameName: [], duplicates: [], similar: [] };
    _groupMemo.similar = pairs;
    _groupMemo.similarSig = sig;
    return pairs;
}

export function bigrams(text) {
    const value = normalizeText(text);
    if (!value) return new Set();
    if (value.length === 1) return new Set([value]);
    const result = new Set();
    for (let i = 0; i < value.length - 1; i++) result.add(value.slice(i, i + 2));
    return result;
}

export function similarity(a, b) {
    const x = normalizeText(a);
    const y = normalizeText(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const ax = bigrams(x);
    const by = bigrams(y);
    let intersection = 0;
    for (const gram of ax) if (by.has(gram)) intersection++;
    const union = ax.size + by.size - intersection;
    return union ? intersection / union : 0;
}
