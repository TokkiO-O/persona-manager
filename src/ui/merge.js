import { escapeHtml } from '../util.js';
import { splitUnits, unitTitleKey } from '../diff.js';
import { getPersonaData, persistPersonaFull } from '../persona-data.js';
import { personaImageUrl } from './components.js';

/**
 * 缝合：双栏 + 中间 ← →；选中后弹窗选写入方式；确认时两侧都写回（不删人设）
 */
export function openMergeDialog(idA, idB, onDone) {
    const all = getPersonaData();
    const pa = all.find(p => p.id === idA);
    const pb = all.find(p => p.id === idB);
    if (!pa || !pb) {
        if (typeof toastr !== 'undefined') toastr.error('找不到要缝合的人设');
        return;
    }

    let leftUnits = splitUnits(pa.description || '');
    let rightUnits = splitUnits(pb.description || '');
    if (!leftUnits.length && (pa.description || '').trim()) leftUnits = [pa.description];
    if (!rightUnits.length && (pb.description || '').trim()) rightUnits = [pb.description];

    const selL = new Set();
    const selR = new Set();

    const overlay = document.createElement('div');
    overlay.className = 'pmp18-editor-overlay is-popup pmp18-stitch-overlay';
    if (window.matchMedia('(max-width: 700px)').matches) overlay.classList.add('is-mobile');
    const mq = window.matchMedia('(max-width: 700px)');
    const syncMq = () => overlay.classList.toggle('is-mobile', mq.matches);
    try { mq.addEventListener('change', syncMq); } catch { mq.addListener?.(syncMq); }

    overlay.innerHTML = `
      <div class="pmp18-editor pmp18-stitch-dialog" role="dialog" aria-modal="true">
        <div class="pmp18-editor-head">
          <strong>缝合人设</strong>
          <span class="pmp18-muted">点选片段 → 中间箭头 → 插入/替换 · 确认后两侧都保存</span>
          <button type="button" class="pmp18-close pmp18-stitch-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="pmp18-stitch-board">
          <div class="pmp18-stitch-col" data-side="left">
            <div class="pmp18-stitch-col-head">
              <img class="pmp18-avatar" src="${escapeHtml(personaImageUrl(pa.id))}" alt="" onerror="this.style.display='none'">
              <div><strong>${escapeHtml(pa.name)}</strong><div class="pmp18-muted pmp18-side-label">左 / 上</div></div>
            </div>
            <div class="pmp18-stitch-units" data-side="left"></div>
          </div>
          <div class="pmp18-stitch-mid">
            <button type="button" class="pmp18-stitch-arrow pmp18-primary-btn" data-dir="to-right" title="左侧 → 右侧">
              <span class="pmp18-arrow-lr">→</span><span class="pmp18-arrow-tb">↓</span>
            </button>
            <button type="button" class="pmp18-stitch-arrow pmp18-primary-btn" data-dir="to-left" title="右侧 → 左侧">
              <span class="pmp18-arrow-lr">←</span><span class="pmp18-arrow-tb">↑</span>
            </button>
            <button type="button" class="pmp18-small-btn pmp18-danger-btn pmp18-stitch-del" data-act="del-sel">删选中</button>
          </div>
          <div class="pmp18-stitch-col" data-side="right">
            <div class="pmp18-stitch-col-head">
              <img class="pmp18-avatar" src="${escapeHtml(personaImageUrl(pb.id))}" alt="" onerror="this.style.display='none'">
              <div><strong>${escapeHtml(pb.name)}</strong><div class="pmp18-muted pmp18-side-label">右 / 下</div></div>
            </div>
            <div class="pmp18-stitch-units" data-side="right"></div>
          </div>
        </div>
        <div class="pmp18-editor-actions">
          <button type="button" class="pmp18-small-btn pmp18-stitch-close">取消</button>
          <button type="button" class="pmp18-primary-btn pmp18-stitch-confirm">保存两侧</button>
        </div>
      </div>`;

    const paint = () => {
        overlay.querySelector('.pmp18-stitch-units[data-side="left"]').innerHTML =
            leftUnits.map((u, i) => unitBtn('left', i, u, selL.has(i))).join('') || '<div class="pmp18-muted">（空）</div>';
        overlay.querySelector('.pmp18-stitch-units[data-side="right"]').innerHTML =
            rightUnits.map((u, i) => unitBtn('right', i, u, selR.has(i))).join('') || '<div class="pmp18-muted">（空）</div>';
    };
    function unitBtn(side, i, text, on) {
        const title = unitTitleKey(text) || `段 ${i + 1}`;
        return `<button type="button" class="pmp18-stitch-unit ${on ? 'is-on' : ''}" data-side="${side}" data-i="${i}">
          <span class="pmp18-stitch-unit-title">${escapeHtml(title)}</span>
          <span class="pmp18-stitch-unit-body">${escapeHtml(String(text).slice(0, 280))}${String(text).length > 280 ? '…' : ''}</span>
        </button>`;
    }
    paint();

    function askHow(dir) {
        return new Promise((resolve) => {
            const targetSide = dir === 'to-right' ? 'right' : 'left';
            const targetUnits = targetSide === 'right' ? rightUnits : leftUnits;
            const targetSel = targetSide === 'right' ? selR : selL;
            const pop = document.createElement('div');
            pop.className = 'pmp18-editor-overlay is-popup';
            pop.style.zIndex = '1000200';
            const anchors = targetUnits.map((u, i) =>
                `<button type="button" class="pmp18-adopt-line ${targetSel.has(i) ? 'is-on' : ''}" data-i="${i}">
                  <span class="pmp18-adopt-line-no">${i + 1}</span>
                  <span class="pmp18-adopt-line-text">${escapeHtml(String(u || '（空）'))}</span>
                </button>`
            ).join('') || '<div class="pmp18-muted">目标侧为空，将直接追加</div>';
            pop.innerHTML = `
              <div class="pmp18-editor pmp18-stitch-how" role="dialog">
                <div class="pmp18-editor-head"><strong>写入方式</strong>
                  <button type="button" class="pmp18-close" data-x><i class="fa-solid fa-xmark"></i></button></div>
                <div class="pmp18-adopt-modes">
                  <label class="pmp18-adopt-mode"><input type="radio" name="how" value="append" ${targetSel.size ? '' : 'checked'}> 追加到目标末尾</label>
                  <label class="pmp18-adopt-mode"><input type="radio" name="how" value="before" ${targetUnits.length ? '' : 'disabled'}> 插入到锚点之前</label>
                  <label class="pmp18-adopt-mode"><input type="radio" name="how" value="after" ${targetUnits.length ? '' : 'disabled'}> 插入到锚点之后</label>
                  <label class="pmp18-adopt-mode"><input type="radio" name="how" value="replace" ${targetUnits.length ? '' : 'disabled'} ${targetSel.size ? 'checked' : ''}> 替换目标选中/锚点</label>
                </div>
                <label class="pmp18-editor-label">锚点（可多选）</label>
                <div class="pmp18-adopt-lines pmp18-stitch-how-lines">${anchors}</div>
                <div class="pmp18-editor-actions">
                  <button type="button" class="pmp18-small-btn" data-x>取消</button>
                  <button type="button" class="pmp18-primary-btn" data-ok>确定</button>
                </div>
              </div>`;
            const chosen = new Set([...targetSel]);
            pop.querySelectorAll('.pmp18-stitch-how-lines .pmp18-adopt-line').forEach(btn => {
                if (chosen.has(Number(btn.dataset.i))) btn.classList.add('is-on');
                btn.onclick = () => {
                    const i = Number(btn.dataset.i);
                    if (chosen.has(i)) chosen.delete(i); else chosen.add(i);
                    btn.classList.toggle('is-on', chosen.has(i));
                };
            });
            const done = (v) => { pop.remove(); resolve(v); };
            pop.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => done(null); });
            pop.addEventListener('click', e => { if (e.target === pop) done(null); });
            pop.querySelector('[data-ok]').onclick = () => {
                done({
                    how: pop.querySelector('input[name="how"]:checked')?.value || 'append',
                    anchors: [...chosen].sort((a, b) => a - b),
                });
            };
            document.body.appendChild(pop);
        });
    }

    function applyChunks(dir, chunks, how, anchors) {
        const targetSide = dir === 'to-right' ? 'right' : 'left';
        let units = (targetSide === 'right' ? rightUnits : leftUnits).slice();
        if (how === 'append' || !units.length || !anchors?.length) {
            units = units.concat(chunks);
        } else if (how === 'replace') {
            if (!anchors.length) units = units.concat(chunks);
            else {
                units = units.slice(0, anchors[0]).concat(chunks, units.slice(anchors[anchors.length - 1] + 1));
            }
        } else {
            for (const i of [...anchors].sort((a, b) => b - a)) {
                units.splice(how === 'before' ? i : i + 1, 0, ...chunks);
            }
        }
        if (targetSide === 'right') { rightUnits = units; selR.clear(); }
        else { leftUnits = units; selL.clear(); }
        paint();
    }

    overlay.addEventListener('click', async (e) => {
        const unit = e.target.closest('.pmp18-stitch-unit');
        if (unit) {
            const side = unit.dataset.side;
            const i = Number(unit.dataset.i);
            const set = side === 'left' ? selL : selR;
            if (set.has(i)) set.delete(i); else set.add(i);
            paint();
            return;
        }
        const dir = e.target.closest('[data-dir]')?.dataset?.dir;
        if (dir === 'to-right' || dir === 'to-left') {
            const srcSet = dir === 'to-right' ? selL : selR;
            const srcUnits = dir === 'to-right' ? leftUnits : rightUnits;
            const chunks = [...srcSet].sort((a, b) => a - b).map(i => srcUnits[i]).filter(Boolean);
            if (!chunks.length) {
                if (typeof toastr !== 'undefined') toastr.info(dir === 'to-right' ? '请先点选左侧片段' : '请先点选右侧片段');
                return;
            }
            const ans = await askHow(dir);
            if (!ans) return;
            applyChunks(dir, chunks, ans.how, ans.anchors);
            return;
        }
        if (e.target.closest('[data-act="del-sel"]')) {
            if (selL.size) { leftUnits = leftUnits.filter((_, i) => !selL.has(i)); selL.clear(); }
            if (selR.size) { rightUnits = rightUnits.filter((_, i) => !selR.has(i)); selR.clear(); }
            paint();
        }
    });

    const close = () => overlay.remove();
    overlay.querySelectorAll('.pmp18-stitch-close').forEach(b => { b.onclick = close; });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('.pmp18-stitch-confirm').onclick = () => {
        const leftDesc = leftUnits.filter(Boolean).join('\n\n');
        const rightDesc = rightUnits.filter(Boolean).join('\n\n');
        const okL = persistPersonaFull(pa.id, pa.name, leftDesc);
        const okR = persistPersonaFull(pb.id, pb.name, rightDesc);
        if (okL && okR) {
            if (typeof toastr !== 'undefined') toastr.success('两侧已保存');
            close();
            onDone && onDone();
        } else if (typeof toastr !== 'undefined') {
            toastr.error(`保存失败：左${okL ? '✓' : '✗'} 右${okR ? '✓' : '✗'}`);
        }
    };

    document.body.appendChild(overlay);
}
