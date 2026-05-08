// Types owned here — used across registry, engine, wire.
export type Formatter = (v: unknown) => unknown;

export interface Tokens { BIND: string; DIR: string; EVT: string; }
export interface Config { TOKENS: Tokens; NO_WAKE: string[]; }
export interface CustomConfig { TOKENS?: Partial<Tokens>; NO_WAKE?: string[]; }

declare global {
    interface Window {
        DW_CUSTOM_CONFIG?: CustomConfig;
    }
}

const DEFAULT_CONFIG: Config = {
    TOKENS: { BIND: '$', DIR: '*', EVT: '@' },
    NO_WAKE: ['DATA-WRAPPER', 'TEMPLATE', 'SVG'],
};

const customConfig = typeof window === 'undefined' ? undefined : window.DW_CUSTOM_CONFIG;

export const CONFIG: Config & Record<string, unknown> = {
    TOKENS: { ...DEFAULT_CONFIG.TOKENS, ...customConfig?.TOKENS },
    NO_WAKE: customConfig?.NO_WAKE ?? DEFAULT_CONFIG.NO_WAKE,
};

export const DW_TEMPLATES = new Map<string, HTMLTemplateElement>();

export const DW_DEFAULT_TEMPLATES = new Map<string, string>([
    ['dw-empty',   '<li data-dw-template="empty">No items</li>'],
    ['dw-missing', '<span data-dw-template="missing">—</span>'],
    ['dw-loading', '<span data-dw-template="loading">Loading...</span>'],
    ['dw-error',   '<span data-dw-template="error">Something went wrong</span>'],
]);

const htmlTemplate = (html: string): HTMLTemplateElement => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl;
};

export const resolveTemplate = (name: string): HTMLTemplateElement | null => {
    const registered = DW_TEMPLATES.get(name);
    if (registered) return registered;
    if (typeof document === 'undefined') return null;

    const declared = document.getElementById(name);
    if (declared?.tagName === 'TEMPLATE') return declared as HTMLTemplateElement;

    const fallback = DW_DEFAULT_TEMPLATES.get(name);
    return fallback ? htmlTemplate(fallback) : null;
};

export const DW_FORMATTERS = new Map<string, Formatter>([
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

export interface DirectiveContext {
    wrapper: {
        _listCache: Map<Element, Map<unknown, Element>>;
    };
    el: Element;
    value: unknown;
    key?: string;
    renderList: (
        container: Element,
        data: Array<Record<string, unknown>>,
        cache: Map<unknown, Element>,
        tpl: HTMLTemplateElement,
        key?: string,
    ) => void;
}

export type DirectiveHandler = (ctx: DirectiveContext) => void;

const listDirective: DirectiveHandler = ({ wrapper, el, value, key, renderList }) => {
    const tpl = el.querySelector(':scope > template') as HTMLTemplateElement | null;
    if (!tpl) return;

    let cache = wrapper._listCache.get(el);
    if (!cache) {
        cache = new Map();
        wrapper._listCache.set(el, cache);
    }

    renderList(el, (value as Array<Record<string, unknown>>) || [], cache, tpl, key);
};

export const DW_DIRECTIVES = new Map<string, DirectiveHandler>([
    ['list', listDirective],
]);

export const resolveDirective = (key: string) => DW_DIRECTIVES.get(key);

export const sync = (el: Element, prop: string, val: unknown) => {
    const alias = resolveAlias(prop);
    if (alias in el) {
        (el as unknown as Record<string, unknown>)[alias] = val;
    } else {
        el.setAttribute(alias, String(val));
    }
};
