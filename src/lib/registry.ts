// Types owned here — used across registry, engine, wire.
export type Formatter = (v: unknown) => unknown;

export interface Tokens { BIND: string; ADD: string; EVT: string; }
export interface Config { TOKENS: Tokens; NO_WAKE: string[]; }

export const CONFIG: Config & Record<string, unknown> = Object.assign({
    TOKENS: { BIND: '$', ADD: '_', EVT: '@' },
    NO_WAKE: ['DATA-WRAPPER', 'TEMPLATE', 'SVG'],
}, (window as Window & { VP_CUSTOM_CONFIG?: Partial<Config> }).VP_CUSTOM_CONFIG || {});

export const VP_TEMPLATES = new Map<string, HTMLTemplateElement>();

export const VP_FORMATTERS = new Map<string, Formatter>([
    ['count',    v => (Array.isArray(v) || typeof v === 'string') ? v.length : 0],
    ['fallback', v => v ?? '—'],
    ['json',     v => JSON.stringify(v, null, 2)],
    ['upper',    v => String(v || '').toUpperCase()],
    ['lower',    v => String(v || '').toLowerCase()],
    ['currency', v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0)],
    ['date',     v => v ? new Date(v as string).toLocaleDateString() : ''],
    ['trim',     v => String(v || '').trim()],
    ['bool',     v => !!v],
    ['onoff',    v => v ? 'on' : 'off'],
    ['yesno',    v => v ? 'yes' : 'no'],
]);

export const PROP_ALIASES: Record<string, string> = {
    text:            'textContent',
    html:            'innerHTML',
    class:           'className',
    for:             'htmlFor',
    readonly:        'readOnly',
    tabindex:        'tabIndex',
    maxlength:       'maxLength',
    minlength:       'minLength',
    contenteditable: 'contentEditable',
    crossorigin:     'crossOrigin',
};

export const resolveAlias = (key: string) => PROP_ALIASES[key] || key;

export const RENDER_DIRECTIVES = new Set(['list']);

export const sync = (el: Element, prop: string, val: unknown) => {
    const alias = resolveAlias(prop);
    if (alias in el) {
        (el as unknown as Record<string, unknown>)[alias] = val;
    } else {
        el.setAttribute(alias, String(val));
    }
};
