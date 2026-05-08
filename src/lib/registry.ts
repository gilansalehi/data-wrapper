// Types owned here — used across registry, engine, wire.
export type Formatter = (v: unknown) => unknown;

export interface Tokens { BIND: string; ADD: string; EVT: string; }
export interface Config { TOKENS: Tokens; NO_WAKE: string[]; }
export interface CustomConfig { TOKENS?: Partial<Tokens>; NO_WAKE?: string[]; }

declare global {
    interface Window {
        VP_CUSTOM_CONFIG?: CustomConfig;
    }
}

const DEFAULT_CONFIG: Config = {
    TOKENS: { BIND: '$', ADD: '_', EVT: '@' },
    NO_WAKE: ['DATA-WRAPPER', 'TEMPLATE', 'SVG'],
};

const customConfig = typeof window === 'undefined' ? undefined : window.VP_CUSTOM_CONFIG;

export const CONFIG: Config & Record<string, unknown> = {
    TOKENS: { ...DEFAULT_CONFIG.TOKENS, ...customConfig?.TOKENS },
    NO_WAKE: customConfig?.NO_WAKE ?? DEFAULT_CONFIG.NO_WAKE,
};

export const VP_TEMPLATES = new Map<string, HTMLTemplateElement>();

export const VP_DEFAULT_TEMPLATES = new Map<string, string>([
    ['vp-empty',   '<li data-vp-template="empty">No items</li>'],
    ['vp-missing', '<span data-vp-template="missing">—</span>'],
    ['vp-loading', '<span data-vp-template="loading">Loading...</span>'],
    ['vp-error',   '<span data-vp-template="error">Something went wrong</span>'],
]);

const htmlTemplate = (html: string): HTMLTemplateElement => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl;
};

export const resolveTemplate = (name: string): HTMLTemplateElement | null => {
    const registered = VP_TEMPLATES.get(name);
    if (registered) return registered;
    if (typeof document === 'undefined') return null;

    const declared = document.getElementById(name);
    if (declared?.tagName === 'TEMPLATE') return declared as HTMLTemplateElement;

    const fallback = VP_DEFAULT_TEMPLATES.get(name);
    return fallback ? htmlTemplate(fallback) : null;
};

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

// CODE SMELL -- we can supply a better type here, the mapping is for props & custom props to attrs.
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

// CODE SMELL -- is this actually being used to update the DOM?
export const sync = (el: Element, prop: string, val: unknown) => {
    const alias = resolveAlias(prop);
    if (alias in el) {
        (el as unknown as Record<string, unknown>)[alias] = val;
    } else {
        el.setAttribute(alias, String(val));
    }
};
