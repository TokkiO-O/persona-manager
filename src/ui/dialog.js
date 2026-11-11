import { state } from '../state.js';
import { escapeHtml } from '../util.js';
import { inlineDiffHtml } from '../diff.js';
import { applyTheme } from '../themes.js';

export function bindVisualViewport(overlay) {
    let referenceWidth = window.innerWidth;
    let referenceHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
    let hadEditableFocus = false, frame = 0;
    const sync = () => {
        const vv = window.visualViewport;
        const height = vv?.height ?? window.innerHeight;
        const width = window.innerWidth;
        // Keep the pre-keyboard height even on browsers that resize the layout viewport.
        if (Math.abs(width - referenceWidth) > 80) { referenceWidth = width; referenceHeight = window.innerHeight; }
        referenceHeight = Math.max(referenceHeight, window.innerHeight, height);
        const editing = overlay.contains(document.activeElement) && document.activeElement?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]),[contenteditable="true"]');
        if (editing) hadEditableFocus = true;
        const reduced = referenceHeight - height > Math.max(100, referenceHeight * .18);
        overlay.classList.toggle('is-keyboard-open', width <= 1000 && (vv?.scale ?? 1) < 1.1 && reduced && hadEditableFocus);
        if (!reduced) hadEditableFocus = !!editing;
        overlay.style.setProperty('--pmp-viewport-height', `${vv?.height ?? window.innerHeight}px`);
        overlay.style.setProperty('--pmp-viewport-width', `${vv?.width ?? window.innerWidth}px`);
        overlay.style.setProperty('--pmp-viewport-top', `${vv?.offsetTop ?? 0}px`);
        overlay.style.setProperty('--pmp-viewport-left', `${vv?.offsetLeft ?? 0}px`);
        overlay.classList.toggle('is-short-viewport', (vv?.height ?? window.innerHeight) < 460);
        overlay.classList.toggle('is-tiny-viewport', height < 260);
        overlay.classList.toggle('is-compact-viewport', (vv?.height ?? window.innerHeight) < 740);
    };
    const onFocus = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); };
    sync();
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    overlay.addEventListener('focusin', onFocus);
    overlay.addEventListener('focusout', onFocus);
    return () => {
        cancelAnimationFrame(frame);
        window.visualViewport?.removeEventListener('resize', sync);
        window.visualViewport?.removeEventListener('scroll', sync);
        window.removeEventListener('resize', sync);
        overlay.removeEventListener('focusin', onFocus);
        overlay.removeEventListener('focusout', onFocus);
    };
}

export function createStudioDialog({ className, title, subtitle, body, footer, canClose = () => true, onClose = () => {} }) {
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = `pmp18-editor-overlay is-popup pmp18-studio-overlay pmp18-theme-${state.settings.uiTheme || 'shoujo'} ${className || ''}`;
    applyTheme(overlay);
    const labelId = `pmp18-dialog-${Math.random().toString(36).slice(2)}`;
    overlay.innerHTML = `<section class="pmp18-editor pmp18-studio-dialog" role="dialog" aria-modal="true" aria-labelledby="${labelId}">
      <header class="pmp18-studio-head"><div><span class="pmp18-eyebrow">PERSONA STUDIO</span><h2 id="${labelId}">${escapeHtml(title)}</h2><p>${escapeHtml(subtitle || '')}</p></div><button type="button" class="pmp18-icon-btn pmp18-studio-close" data-close aria-label="关闭">×</button></header>
      <div class="pmp18-studio-body">${body}</div>
      <div class="pmp18-dialog-error" role="alert" hidden></div>
      <footer class="pmp18-studio-footer">${footer}</footer>
    </section>`;
    const unbindViewport = bindVisualViewport(overlay);
    let closed = false;
    const close = (force = false) => {
        if (closed) return;
        const allowed = force || canClose();
        if (allowed && typeof allowed.then === 'function') { allowed.then(ok => { if (ok) close(true); }).catch(error => { overlay.querySelector('.pmp18-dialog-error').textContent=error.message;overlay.querySelector('.pmp18-dialog-error').hidden=false; });return; }
        if (!allowed) return;
        closed = true;
        unbindViewport();
        overlay.removeEventListener('keydown', onKey, true);
        overlay.remove();
        onClose(force);
        if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
    overlay.__pmp18Dialog = { close };
    const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
        if (e.key !== 'Tab') return;
        const focusable = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    overlay.addEventListener('keydown', onKey, true);
    overlay.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => close()));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    (document.fullscreenElement || document.body).appendChild(overlay);
    requestAnimationFrame(() => overlay.querySelector('[data-initial-focus], [data-close]')?.focus({ preventScroll: true }));
    return { overlay, close, error(message = '') { const el = overlay.querySelector('.pmp18-dialog-error'); el.textContent = message; el.hidden = !message; } };
}

export function renderResultPreview(container, before, after, diff = false) {
    if (!diff) {
        container.innerHTML = `<pre class="pmp18-result-text">${escapeHtml(after || '（空内容）')}</pre>`;
        return;
    }
    const { left, right } = inlineDiffHtml(before, after);
    container.innerHTML = `<div class="pmp18-result-diff"><section><h4>修改前</h4><pre>${left || '（空内容）'}</pre></section><section><h4>修改后</h4><pre>${right || '（空内容）'}</pre></section></div>`;
}
