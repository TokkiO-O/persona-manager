import { UI_THEMES, normalizeThemeId } from './constants.js';
import { state } from './state.js';

const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const hex = value => '#' + value.map(n => Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0')).join('');
const mix = (a,b,amount) => hex(rgb(a).map((n,i) => n*(1-amount)+rgb(b)[i]*amount));
const luminance = color => rgb(color).map(n => { const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; }).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
const contrast = (a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export const isHexColor = value => /^#[0-9a-f]{6}$/i.test(String(value));

export function getThemePalette(id = state.settings.uiTheme) {
    const theme = UI_THEMES.find(t => t.id === normalizeThemeId(id));
    const colors = { ...theme.colors };
    const custom = state.settings.themeColors?.[theme.id] || {};
    for (const key of ['accent','bg','surface','ink']) if (isHexColor(custom[key])) colors[key] = custom[key];
    if (contrast(colors.ink,colors.surface)<4.5) colors.ink = contrast('#302a2f',colors.surface)>contrast('#fffaff',colors.surface)?'#302a2f':'#fffaff';
    return colors;
}

export function applyTheme(element) {
    if (!element) return;
    const id=normalizeThemeId(state.settings.uiTheme), colors=getThemePalette(id);
    for (const name of [...element.classList]) if (name.startsWith('pmp18-theme-')) element.classList.remove(name);
    element.classList.add('pmp18-theme-'+id);element.dataset.theme=id;
    element.style.colorScheme=luminance(colors.surface)<.35?'dark':'light';
    const values = {
        accent: colors.accent, 'accent-strong': mix(colors.accent,colors.ink,.18),
        'accent-soft': mix(colors.surface,colors.accent,.17), 'accent-faint': mix(colors.surface,colors.accent,.055),
        bg:colors.bg,surface:colors.surface,ink:colors.ink,
        muted:mix(colors.ink,colors.surface,.25),line:mix(colors.surface,colors.ink,.15),
        'on-accent':contrast('#ffffff',colors.accent)>=contrast('#302a2f',colors.accent)?'#ffffff':'#302a2f',
        'texture-ink':mix(colors.bg,colors.accent,.16), 'shadow-color':mix(colors.bg,colors.ink,.18),
    };
    for(const [key,value] of Object.entries(values))element.style.setProperty('--pmp-'+key,value);
}

export function refreshThemes() {
    document.querySelectorAll('#pmp18-root,.pmp18-editor-overlay,.pmp18-update-overlay,.pmp18-entry,.pmp18-native-beside,.pmp18-native-expand').forEach(applyTheme);
}
