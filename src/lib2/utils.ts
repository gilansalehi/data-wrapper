export type Off = () => void;

export type pURL = {
    path:     string;
    isRel:    boolean;
    params:   URLSearchParams;
    host:     string;
    protocol: string;
};

const DWRL_BASE = 'dwrl://data-wrapper/';

export const pURL = (raw: string): pURL => {
    let isRel = raw.startsWith('./');
    const url = new URL(raw.slice(isRel ? 1 : 0), DWRL_BASE);
    let path  = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    if (path.startsWith('./')) { isRel = true; path = path.slice(2); }
    return { path, isRel, params: url.searchParams, host: url.hostname, protocol: url.protocol };
};

export const p = pURL;

export const readPath = (obj: unknown, path: string): unknown =>
    !path ? obj : path.split('/').reduce<unknown>(
        (acc, k) => acc == null ? undefined : (acc as Record<string, unknown>)[k],
        obj,
    );

type Ctx = Element | Document | DocumentFragment;

export const q = (s: string, ctx: Ctx = document) => [...ctx.querySelectorAll(s)];

export const emit = (name: string, detail?: unknown, ctx: Ctx = document) =>
    ctx.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

export const on = (name: string, cb: EventListener, ctx: Ctx = document): Off => {
    ctx.addEventListener(name, cb);
    return () => ctx.removeEventListener(name, cb);
};

export const cloneTemplate = (tpl: HTMLTemplateElement): Element | null =>
    (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild;
