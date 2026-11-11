/** Textareas normalize newlines. Keep untouched bytes and the source's newline style. */
export function textFromTextarea(value, previous) {
    const raw=String(previous??''),normalized=raw.replace(/\r\n|\r/g,'\n'),next=String(value??'').replace(/\r\n|\r/g,'\n');
    if(normalized===next)return raw;
    let start=0,end=0;
    while(start<normalized.length&&start<next.length&&normalized[start]===next[start])start++;
    while(end<normalized.length-start&&end<next.length-start&&normalized[normalized.length-1-end]===next[next.length-1-end])end++;
    const rawOffset=offset=>{let index=0,count=0;while(count<offset&&index<raw.length){index+=raw[index]==='\r'&&raw[index+1]==='\n'?2:1;count++;}return index;};
    const eol=raw.includes('\r\n')?'\r\n':raw.includes('\r')&&!raw.includes('\n')?'\r':'\n';
    return raw.slice(0,rawOffset(start))+next.slice(start,next.length-end).replace(/\n/g,eol)+raw.slice(rawOffset(normalized.length-end));
}

/** Offsets always refer to the untouched source, including its original line endings. */
export function lineRanges(value) {
    const text = String(value ?? '');
    const out = [];
    const re = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
    let match;
    while ((match = re.exec(text)) && match[0]) {
        const raw = match[0];
        out.push({ start: match.index, end: re.lastIndex, text: raw, label: raw.replace(/[\r\n]+$/, '') });
    }
    return out;
}

export function textUnits(value, mode = 'paragraph') {
    const text = String(value ?? '');
    const lines = lineRanges(text);
    if (mode === 'line') return lines;
    const out = [];
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
        const atEnd = i === lines.length - 1;
        const blankEnd = !lines[i].label.trim() && lines[i + 1]?.label.trim();
        if (!atEnd && !blankEnd) continue;
        const end = lines[i].end;
        const raw = text.slice(start, end);
        if (raw.trim()) out.push({ start, end, text: raw, label: raw.replace(/[\r\n]+$/, '') });
        else if (out.length) { out[out.length - 1].end = end; out[out.length - 1].text += raw; }
        start = end;
    }
    return out;
}

function boundary(left, insert, right, eol) {
    if (!insert) return '';
    const before = left && !/[\r\n]$/.test(left) && !/^[\r\n]/.test(insert) ? eol : '';
    const after = right && !/[\r\n]$/.test(insert) && !/^[\r\n]/.test(right) ? eol : '';
    return before + insert + after;
}

export function applyTextEdit(value, insert, mode, ranges = []) {
    const text = String(value ?? '');
    const content = String(insert ?? '');
    const eol = text.includes('\r\n') ? '\r\n' : text.includes('\r') && !text.includes('\n') ? '\r' : '\n';
    const selected = [...ranges].sort((a, b) => a.start - b.start);
    for (let i = 0; i < selected.length; i++) {
        const r = selected[i];
        if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end > text.length || r.start >= r.end || (i && selected[i - 1].end > r.start)) {
            throw new Error('片段位置已变化，请重新选择。');
        }
    }
    if (mode === 'replace-all') return content;
    if (mode === 'append') {
        if (!text) return content;
        if (!content) return text;
        return text + boundary(text, content, '', eol);
    }
    if (!selected.length) throw new Error('请先选择写入位置。');
    let next = text;
    for (let i = selected.length - 1; i >= 0; i--) {
        const r = selected[i];
        if (mode === 'replace' || mode === 'delete') {
            const replacement = mode === 'replace' && i === 0 ? boundary(text.slice(0, r.start), content, text.slice(r.end), eol) : '';
            next = next.slice(0, r.start) + replacement + next.slice(r.end);
        } else if (mode === 'before' || mode === 'after') {
            const at = mode === 'before' ? r.start : r.end;
            const addition = boundary(text.slice(0, at), content, text.slice(at), eol);
            next = next.slice(0, at) + addition + next.slice(at);
        } else throw new Error('未知的写入方式。');
    }
    return next;
}

export function selectedText(units, selected) {
    return [...selected].sort((a, b) => a - b).map(i => units[i]?.text || '').join('');
}
