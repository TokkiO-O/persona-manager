import { escapeHtml } from '../util.js';
import { getPersonaData, persistPersonaFull } from '../persona-data.js';

function splitLines(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];
    return raw.split('\n');
}

export function openAdoptDialog({ baselineId, snippet, onDone }) {
    const text = String(snippet || '').trim();
    if (!text) {
        if (typeof toastr !== 'undefined') toastr.warning('没有可采纳的内容');
        return;
    }
    const all = getPersonaData();
    const base = all.find(p => p.id === baselineId);
    if (!base) {
        if (typeof toastr !== 'undefined') toastr.error('找不到基准人设');
        return;
    }
    const lines = splitLines(base.description || '');
    let mode = 'append';
    const anchors = new Set();

    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay is-popup pmp18-adopt-overlay';
    overlay.innerHTML = `
      <div class="pmp18-editor pmp18-adopt-dialog" role="dialog" aria-modal="true">
        <div class="pmp18-editor-head">
          <strong>采纳到基准</strong>
          <span class="pmp18-muted">${escapeHtml(base.name)}</span>
          <button type="button" class="pmp18-close pmp18-adopt-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <label class="pmp18-editor-label">写入方式</label>
        <div class="pmp18-adopt-modes">
          <label class="pmp18-adopt-mode"><input type="radio" name="pmp-adopt-mode" value="append" checked> 追加到末尾</label>
          <label class="pmp18-adopt-mode"><input type="radio" name="pmp-adopt-mode" value="replace-all"> 替换全文</label>
          <label class="pmp18-adopt-mode"><input type="radio" name="pmp-adopt-mode" value="before" ${lines.length ? '' : 'disabled'}> 插入到锚点行之前</label>
          <label class="pmp18-adopt-mode"><input type="radio" name="pmp-adopt-mode" value="after" ${lines.length ? '' : 'disabled'}> 插入到锚点行之后</label>
          <label class="pmp18-adopt-mode"><input type="radio" name="pmp-adopt-mode" value="replace-line" ${lines.length ? '' : 'disabled'}> 替换锚点行</label>
        </div>
        <div class="pmp18-adopt-anchor-wrap" hidden>
          <label class="pmp18-editor-label">点选锚点行（可多选）</label>
          <div class="pmp18-adopt-lines" role="listbox" aria-multiselectable="true">
            ${lines.map((ln, i) =>
                `<button type="button" class="pmp18-adopt-line" data-i="${i}">
                  <span class="pmp18-adopt-line-no">${i + 1}</span>
                  <span class="pmp18-adopt-line-text">${escapeHtml(ln || '（空行）')}</span>
                </button>`
            ).join('') || '<div class="pmp18-muted pmp18-adopt-empty">基准无内容</div>'}
          </div>
        </div>
        <label class="pmp18-editor-label">将写入内容</label>
        <pre class="pmp18-merge-preview">${escapeHtml(text.slice(0, 1200))}${text.length > 1200 ? '…' : ''}</pre>
        <div class="pmp18-editor-actions">
          <button type="button" class="pmp18-small-btn pmp18-adopt-close">取消</button>
          <button type="button" class="pmp18-primary-btn pmp18-adopt-confirm">确认写入</button>
        </div>
      </div>`;

    const anchorWrap = overlay.querySelector('.pmp18-adopt-anchor-wrap');
    const syncAnchorVis = () => {
        const need = mode === 'before' || mode === 'after' || mode === 'replace-line';
        anchorWrap.hidden = !need;
    };
    syncAnchorVis();

    const close = () => overlay.remove();
    overlay.querySelectorAll('.pmp18-adopt-close').forEach(b => { b.onclick = close; });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.addEventListener('change', e => {
        if (e.target.name === 'pmp-adopt-mode') {
            mode = e.target.value;
            syncAnchorVis();
        }
    });

    overlay.querySelector('.pmp18-adopt-lines')?.addEventListener('click', e => {
        const btn = e.target.closest('.pmp18-adopt-line');
        if (!btn) return;
        const i = Number(btn.dataset.i);
        if (anchors.has(i)) anchors.delete(i); else anchors.add(i);
        btn.classList.toggle('is-on', anchors.has(i));
    });

    overlay.querySelector('.pmp18-adopt-confirm').onclick = () => {
        mode = overlay.querySelector('input[name="pmp-adopt-mode"]:checked')?.value || mode;
        const insertLines = text.split(/\r\n?|\n/);
        let next = lines.slice();

        if (mode === 'replace-all') {
            if (!confirm('确定替换基准全文？')) return;
            next = insertLines;
        } else if (mode === 'append') {
            next = lines.concat(insertLines);
        } else if (mode === 'before' || mode === 'after' || mode === 'replace-line') {
            if (!anchors.size) {
                if (typeof toastr !== 'undefined') toastr.warning('请先点选至少一行锚点');
                return;
            }
            if (mode === 'replace-line') {
                const idxs = [...anchors].sort((a, b) => a - b);
                next = next.slice(0, idxs[0]).concat(insertLines, next.slice(idxs[idxs.length - 1] + 1));
            } else {
                const idxs = [...anchors].sort((a, b) => b - a);
                for (const i of idxs) {
                    next.splice(mode === 'before' ? i : i + 1, 0, ...insertLines);
                }
            }
        }

        if (persistPersonaFull(base.id, base.name, next.join('\n'))) {
            if (typeof toastr !== 'undefined') toastr.success('已写入基准');
            close();
            onDone && onDone();
        } else if (typeof toastr !== 'undefined') toastr.error('写入失败');
    };

    document.body.appendChild(overlay);
}
