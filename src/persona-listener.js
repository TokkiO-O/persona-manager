import { EXT } from './constants.js';
import { state } from './state.js';
import { invalidatePersonaCache } from './persona-data.js';

let _refresh = () => {};
export function setPersonaListenerRefresh(fn) {
    _refresh = typeof fn === 'function' ? fn : () => {};
}

let _personaListenerInstalled = false;

export function installPersonaListener() {
    if (_personaListenerInstalled) return;
    _personaListenerInstalled = true;
    try {
        const ctx = window.SillyTavern?.getContext?.();
        const es = ctx?.eventSource;
        if (!es?.on) return;
        const types = ctx?.eventTypes || ctx?.event_types || {};
        const updated = types.PERSONA_UPDATED || 'PERSONA_UPDATED';
        const deleted = types.PERSONA_DELETED || 'PERSONA_DELETED';
        es.on(updated, () => {
            invalidatePersonaCache('event:PERSONA_UPDATED');
            if (state.active) _refresh();
        });
        es.on(deleted, () => {
            invalidatePersonaCache('event:PERSONA_DELETED');
            if (state.active) _refresh();
        });
        console.log(`[${EXT}] persona event listener attached`);
    } catch (e) {
        console.warn(`[${EXT}] could not attach persona event listener`, e);
    }
}
