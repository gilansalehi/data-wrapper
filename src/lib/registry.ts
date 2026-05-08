export type Formatter = (v: unknown) => unknown;

const htmlTemplate = (html: string) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl;
};

export const DW_TEMPLATES = new Map<string, HTMLTemplateElement>([
    ['dw-empty',   htmlTemplate('<li data-dw-template="empty">No items</li>')],
    ['dw-missing', htmlTemplate('<span data-dw-template="missing">—</span>')],
    ['dw-loading', htmlTemplate('<span data-dw-template="loading">Loading...</span>')],
    ['dw-error',   htmlTemplate('<span data-dw-template="error">Something went wrong</span>')],
]);

export const resolveTemplate = (name: string): HTMLTemplateElement | null => {
    const declared = document.getElementById(name);
    if (declared?.tagName === 'TEMPLATE') return declared as HTMLTemplateElement;

    return DW_TEMPLATES.get(name) || null;
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

export type DirectiveWrapper = HTMLElement & {
    _listCache: Map<Element, Map<unknown, Element>>;
};

export interface DirectiveContext {
    wrapper: DirectiveWrapper;
    el: Element;
    value: unknown;
    key?: string;
    hydrate: (node: Element, itemNode: Element) => void;
}

export type DirectiveHandler = (ctx: DirectiveContext) => void;

export const DW_DIRECTIVES = new Map<string, DirectiveHandler>();

export const resolveDirective = (key: string) => DW_DIRECTIVES.get(key);

export const sync = (el: Element, prop: string, val: unknown) => {
    const alias = resolveAlias(prop);
    if (alias in el) {
        (el as unknown as Record<string, unknown>)[alias] = val;
    } else {
        el.setAttribute(alias, String(val));
    }
};
