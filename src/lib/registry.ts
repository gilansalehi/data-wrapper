export type Sub = (value: unknown) => void;
export type Subs = Sub[];
export type Station = Record<string, Subs>;
export type Formatter = (v: unknown) => unknown;
export type Item = Record<string, unknown>;
export type Row = { node: Element; item: Item; subs: Station };
export type ListCache = Map<Element, Map<unknown, Row>>;

// #region @-dispatch
export type DispatchPayload = Record<string, FormDataEntryValue | FormDataEntryValue[]>;
export type DispatchDetail  = {
    originalEvent: Event;
    payload:       DispatchPayload;
};
export type DispatchEvent = CustomEvent<DispatchDetail>;
// #endregion
// #region wrapper-contract
export type Wrapper = HTMLElement & {
    state:        Record<string, unknown>;
    _subs:        Station;
    _listCache:   ListCache;
};
// #endregion

const tmpl = (html: string) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl;
};

export const DW_TEMPLATES = [...document.querySelectorAll('template')].reduce((acc, item) => {
    return acc.set(item.id, item as HTMLTemplateElement);
}, new Map<string, HTMLTemplateElement>([
    // #region templates
    ['dw-empty',   tmpl('<li data-dw-template="empty">No items</li>')],
    ['dw-missing', tmpl('<span data-dw-template="missing">—</span>')],
    ['dw-loading', tmpl('<span data-dw-template="loading">Loading...</span>')],
    ['dw-error',   tmpl('<span data-dw-template="error">Something went wrong</span>')],
    // #endregion
]));

export const resolveTemplate = (name: string): HTMLTemplateElement => {
    const declared = document.getElementById(name);
    if (declared?.tagName === 'TEMPLATE') return declared as HTMLTemplateElement;

    return DW_TEMPLATES.get(name) ?? DW_TEMPLATES.get('dw-missing') as HTMLTemplateElement;
};

export const cloneTemplate = (tpl: HTMLTemplateElement) =>
    (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild as Element | null;

export const DW_FORMATTERS = new Map<string, Formatter>([
    // #region formatters
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
    // #endregion
]);

export const PROP_ALIASES: Record<string, string> = {
    // #region prop-aliases
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
    // #endregion
};

export interface DirectiveContext {
    wrapper: Wrapper;
    el: Element;
    key?: string;
    row?: Row | null;
    wake: (node: Element, row?: Row | null, wrapper?: Wrapper | null) => void;
}

export type DirectiveHandler = (ctx: DirectiveContext) => Sub;

export const DW_DIRECTIVES = new Map<string, DirectiveHandler>();
