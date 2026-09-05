import { COMMON_STOPWORDS } from './constants.js';
import { state } from './state.js';
import { escapeHtml, normalizeText } from './util.js';
import { similarity } from './similarity.js';

/* ---------- Diff engine ---------- */

/** Short heading line: section title, not a long prose sentence */
export function isSectionTitleLine(line) {
    const t = String(line || '').trim();
    if (!t || t.length > 36) return false;
    if (/^#{1,6}\s/.test(t)) return true;
    if (/[:：]\s*$/.test(t) && t.length <= 24) return true;
    if (/^\s*[\w\u4e00-\u9fff./_-]{1,20}\s*[:：]/.test(t) && t.length <= 28) return true;
    // Bare short labels without ending punctuation (e.g. 五官细节 / 女)
    if (t.length <= 16 && !/[。！？；;,.!?]$/.test(t) && !/\s{2,}/.test(t)) return true;
    return false;
}

/**
 * Split into sections: title line merges with following body until next title.
 * Avoids "仅基准: 发型与发色" while body text exists on both sides unmatched.
 */
export function splitUnits(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];
    const lines = raw.split('\n');

    const units = [];
    let buf = [];
    const flush = () => {
        const t = buf.join('\n').trim();
        if (t) units.push(t);
        buf = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
            // blank line: if buffer has content and next is a title, flush
            if (buf.length && i + 1 < lines.length && isSectionTitleLine(lines[i + 1])) {
                flush();
            } else if (buf.length) {
                buf.push(line);
            }
            continue;
        }
        if (isSectionTitleLine(line) && buf.length) {
            flush();
            buf.push(line);
            continue;
        }
        buf.push(line);
    }
    flush();

    if (units.length >= 2) return units;

    // Fallback: paragraphs then lines
    let parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) parts = lines.map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [raw.trim()];
}

/** Prefer matching units that share the same first-line title */
export function unitTitleKey(unit) {
    const first = String(unit || '').split('\n').map(s => s.trim()).find(Boolean) || '';
    return normalizeText(first.replace(/[:：]\s*$/, '')).slice(0, 24);
}

export function tokenize(text) {
    return String(text).match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
}

export function lcsDiff(aTokens, bTokens) {
    const n = aTokens.length;
    const m = bTokens.length;
    if (n * m > 12000) return [{ type: 'replace', a: aTokens, b: bTokens }];
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = aTokens[i] === bTokens[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out = [];
    let i = 0, j = 0;
    const push = (type, a, b) => {
        if (!a.length && !b.length) return;
        const last = out[out.length - 1];
        if (last && last.type === type) {
            last.a.push(...a);
            last.b.push(...b);
        } else out.push({ type, a: [...a], b: [...b] });
    };
    while (i < n && j < m) {
        if (aTokens[i] === bTokens[j]) {
            push('same', [aTokens[i]], [bTokens[j]]);
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            push('remove', [aTokens[i]], []);
            i++;
        } else {
            push('add', [], [bTokens[j]]);
            j++;
        }
    }
    if (i < n) push('remove', aTokens.slice(i), []);
    if (j < m) push('add', [], bTokens.slice(j));
    return out;
}

export function inlineDiffHtml(a, b) {
    const parts = lcsDiff(tokenize(a), tokenize(b));
    let left = '';
    let right = '';
    for (const part of parts) {
        const L = escapeHtml(part.a.join(''));
        const R = escapeHtml(part.b.join(''));
        if (part.type === 'same') {
            left += L;
            right += R;
        } else if (part.type === 'remove') {
            left += L ? `<mark class="pmp18-del">${L}</mark>` : '';
        } else if (part.type === 'add') {
            right += R ? `<mark class="pmp18-add">${R}</mark>` : '';
        } else {
            left += L ? `<mark class="pmp18-del">${L}</mark>` : '';
            right += R ? `<mark class="pmp18-add">${R}</mark>` : '';
        }
    }
    return { left, right };
}

export function unorderedDiff(aText, bText) {
    const aUnits = splitUnits(aText);
    const bUnits = splitUnits(bText);
    const usedB = new Set();
    const pairs = [];
    const soft = state.settings.softMatchThreshold ?? 0.35;

    // Pass 0: same section title key (e.g. 发型与发色 / 五官细节)
    for (let i = 0; i < aUnits.length; i++) {
        const ta = unitTitleKey(aUnits[i]);
        if (!ta) continue;
        for (let j = 0; j < bUnits.length; j++) {
            if (usedB.has(j)) continue;
            if (unitTitleKey(bUnits[j]) === ta) {
                const s = similarity(aUnits[i], bUnits[j]);
                const type = s >= 0.92 || normalizeText(aUnits[i]) === normalizeText(bUnits[j]) ? 'same' : 'replace';
                pairs.push({ type, a: aUnits[i], b: bUnits[j], ai: i, bj: j, matched: true });
                usedB.add(j);
                break;
            }
        }
    }

    // Pass 1: exact full-unit match for remaining
    for (let i = 0; i < aUnits.length; i++) {
        if (pairs.some(p => p.ai === i)) continue;
        const na = normalizeText(aUnits[i]);
        let matched = false;
        for (let j = 0; j < bUnits.length; j++) {
            if (usedB.has(j)) continue;
            if (normalizeText(bUnits[j]) === na) {
                pairs.push({ type: 'same', a: aUnits[i], b: bUnits[j], ai: i, bj: j });
                usedB.add(j);
                matched = true;
                break;
            }
        }
        if (!matched) pairs.push({ type: 'pending', a: aUnits[i], b: null, ai: i, bj: -1 });
    }

    // Pass 2: best similarity for pending
    for (const p of pairs) {
        if (p.type !== 'pending') continue;
        let bestJ = -1;
        let bestScore = 0;
        for (let j = 0; j < bUnits.length; j++) {
            if (usedB.has(j)) continue;
            const s = similarity(p.a, bUnits[j]);
            if (s > bestScore) {
                bestScore = s;
                bestJ = j;
            }
        }
        if (bestJ >= 0 && bestScore >= soft) {
            p.type = bestScore >= 0.92 ? 'same' : 'replace';
            p.b = bUnits[bestJ];
            p.bj = bestJ;
            usedB.add(bestJ);
        } else {
            p.type = 'remove';
            p.b = '';
        }
    }

    for (let j = 0; j < bUnits.length; j++) {
        if (usedB.has(j)) continue;
        pairs.push({ type: 'add', a: '', b: bUnits[j], ai: -1, bj: j });
    }

    pairs.sort((x, y) => {
        if (x.ai >= 0 && y.ai >= 0) return x.ai - y.ai;
        if (x.ai >= 0) return -1;
        if (y.ai >= 0) return 1;
        return x.bj - y.bj;
    });
    return pairs;
}

export function countPairStats(rows) {
    return {
        same: rows.filter(r => r.type === 'same').length,
        replace: rows.filter(r => r.type === 'replace').length,
        remove: rows.filter(r => r.type === 'remove').length,
        add: rows.filter(r => r.type === 'add').length,
    };
}

export function diffModeClass(score) {
    if (score >= 0.85) return 'mode-high';
    if (score >= 0.5) return 'mode-mid';
    return 'mode-low';
}

export function looksStructured(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) return false;
    const field = lines.filter(l => /^[\w\u4e00-\u9fff./_-]+\s*[:：]/.test(l)).length;
    return field / lines.length >= 0.4;
}

/** Shared short facts (numbers, measures, short phrases) for cross-structure compare */
export function extractSharedSnippets(aText, bText) {
    const a = String(aText || '');
    const b = String(bText || '');
    if (!a || !b) return [];

    const candidates = new Set();
    const pushMatches = (text, re) => {
        const m = text.match(re) || [];
        for (const x of m) {
            const t = x.trim();
            if (t.length >= 3) candidates.add(t);
        }
    };

    // 1) Measurements: number REQUIRED to come with a unit. A bare "kg" / "cm"
    //    / "%" is a noisy overlap that almost every persona has; the unit alone
    //    conveys no shared identity.
    pushMatches(a, /\d+(?:\.\d+)?\s*(?:cm|kg|mm|cm³|m|岁|年|月|日|%|度|个|岁|V|W|cm3|kg\/m[²2]?)/gi);
    // 2) Proper-noun-ish phrases: Han/alpha runs, length 3..14.
    //    (length 2 dropped because too many common CJK words like 身高/三围/体重
    //    /性格/特点/名字/年龄/性别/血型 would match and dominate the list.)
    pushMatches(a, /[A-Za-z\u4e00-\u9fff]{3,14}/g);

    // 3) Quoted / bracketed short labels, e.g. 『发色：黑』, "瞳色：蓝"
    pushMatches(a, /[「『"']([^「『"'\n]{2,18})[」』"']/g);
    // Strip the surrounding quotes — we keep the inner text
    // (handled below in the dedup pass)

    const shared = [];
    const aLow = a.toLocaleLowerCase();
    const bLow = b.toLocaleLowerCase();
    for (const c of candidates) {
        if (c.length < 3 || c.length > 24) continue;
        if (COMMON_STOPWORDS.has(c.toLocaleLowerCase())) continue;
        if (b.includes(c) || bLow.includes(c.toLocaleLowerCase())) shared.push(c);
    }

    // unique, longer first, then drop if substring of an already-kept longer one
    const seen = new Set();
    return shared
        .sort((x, y) => y.length - x.length)
        .filter(s => {
            const k = normalizeText(s);
            if (seen.has(k)) return false;
            for (const keep of seen) {
                if (keep.includes(s) && keep !== s) return false;
            }
            seen.add(k);
            return true;
        })
        .slice(0, 40);
}

// See COMMON_STOPWORDS at top of file (must be declared before
// extractSharedSnippets to avoid the const TDZ trap).

export function shouldUseFragmentMode(baseText, otherText, score) {
    if (score < 0.15) return true;
    const aS = looksStructured(baseText);
    const bS = looksStructured(otherText);
    if (aS !== bS) return true;
    return false;
}

export function highlightSnippets(text, snippets) {
    let html = escapeHtml(text);
    const sorted = [...snippets].sort((a, b) => b.length - a.length);
    for (const s of sorted) {
        const esc = escapeHtml(s);
        if (!esc) continue;
        html = html.split(esc).join(`<mark class="pmp18-share">${esc}</mark>`);
    }
    return html;
}

export function renderFragmentCompare(baseText, otherText) {
    const shared = extractSharedSnippets(baseText, otherText);
    const shareHtml = shared.length
        ? `<div class="pmp18-share-list">${shared.map(s => `<span class="pmp18-share-chip">${escapeHtml(s)}</span>`).join('')}</div>`
        : `<div class="pmp18-muted">未抽出可对齐的共同短句/数字（结构差异较大时属正常）</div>`;

    return {
        legendExtra: true,
        sharedCount: shared.length,
        baseHtml: `<div class="pmp18-col-block frag">${highlightSnippets(baseText, shared)}</div>`,
        otherHtml: `<div class="pmp18-col-block frag">${highlightSnippets(otherText, shared)}</div>`,
        sharePanel: `<div class="pmp18-share-panel"><div class="pmp18-share-title">共同片段（${shared.length}）</div>${shareHtml}</div>`,
    };
}

/** Symmetric blocks: side 'base' | 'other' */
export function renderFocusBlocks(baseText, otherText, side, showDiffOnly) {
    const rows = unorderedDiff(baseText, otherText);
    const parts = [];
    for (const row of rows) {
        const isPureSame = row.type === 'same' && (row.a === row.b || normalizeText(row.a) === normalizeText(row.b));
        if (showDiffOnly && isPureSame) continue;

        if (row.type === 'same') {
            if (isPureSame) {
                parts.push(`<div class="pmp18-col-block same">${escapeHtml(side === 'base' ? row.a : row.b)}</div>`);
            } else {
                const { left, right } = inlineDiffHtml(row.a, row.b);
                parts.push(`<div class="pmp18-col-block replace">${side === 'base' ? left : right}</div>`);
            }
        } else if (row.type === 'remove') {
            if (side === 'base') {
                parts.push(`<div class="pmp18-col-block remove"><span class="pmp18-tag">仅基准</span><mark class="pmp18-del">${escapeHtml(row.a)}</mark></div>`);
            } else {
                parts.push(`<div class="pmp18-col-block remove pmp18-ghost"><span class="pmp18-tag">基准有 · 对方无</span></div>`);
            }
        } else if (row.type === 'add') {
            if (side === 'other') {
                parts.push(`<div class="pmp18-col-block add"><span class="pmp18-tag">仅对方</span><mark class="pmp18-add">${escapeHtml(row.b)}</mark></div>`);
            } else {
                parts.push(`<div class="pmp18-col-block add pmp18-ghost"><span class="pmp18-tag">对方有 · 基准无</span></div>`);
            }
        } else {
            const { left, right } = inlineDiffHtml(row.a, row.b);
            parts.push(`<div class="pmp18-col-block replace">${side === 'base' ? left : right}</div>`);
        }
    }
    return parts.join('') || '<div class="pmp18-muted" style="padding:12px">无内容</div>';
}

export function renderCompareLegend(fragmentMode) {
    return `
        <div class="pmp18-legend">
            <span class="pmp18-legend-title">图例</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg same"></i>相同/高度重合</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg replace"></i>对应段有修改</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg remove"></i>仅基准有</span>
            <span class="pmp18-legend-item"><i class="pmp18-leg add"></i>仅对方有</span>
            ${fragmentMode ? '<span class="pmp18-legend-item"><i class="pmp18-leg share"></i>共同片段（跨结构）</span>' : ''}
            <span class="pmp18-legend-note">${fragmentMode ? '当前为跨结构/低相似模式：先标共同片段，再通读全文。' : '按章节对齐；粉=删、绿=增。'}</span>
        </div>`;
}

