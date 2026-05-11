export const DWRL_BASE = 'dwrl://data-wrapper/';

export type pURL = {
    path:     string,
    isRel:    boolean,            // true when source starts with './'
    key:      string | undefined, // ?key= override (used by *list identity)
    params:   URLSearchParams,
    hash:     string,
    host:     string,             // Roadmap: mesh resolution
    protocol: string,             // Roadmap: api:// etc.
};

export const pURL = (dwrlString: string): pURL => {
    const isRel = dwrlString.startsWith('./');
    const url   = new URL(dwrlString.slice(isRel ? 1 : 0), DWRL_BASE);

    const purl: pURL = {
        path:     url.pathname.slice(1),
        isRel,
        key:      url.searchParams.get('key') ?? undefined,
        params:   url.searchParams,
        hash:     url.hash,
        host:     url.hostname,
        protocol: url.protocol,
    };

    if (url.hash === '#debug') console.info('debug:pURL', purl);

    return purl;
};

export const p = pURL;

export const q = (s: string, ctx: Element | Document | DocumentFragment = document) => [...ctx.querySelectorAll(s)];

export const emit = (eventName: string, payload?: unknown, ctx: Element | Document = document) => {
    const { path, params } = p(eventName);

    ctx.dispatchEvent(new CustomEvent(path ?? eventName, {
        bubbles: true,
        detail: Object.assign({}, params, payload)
    }));
};

export const on = (eventName: string, cb: EventListener, delegate = '', ctx: Element | Document = document): () => void => {
    const handler: EventListener = delegate
        ? delegateCb(cb, delegate, ctx)
        : cb;
    ctx.addEventListener(eventName, handler);
    return () => ctx.removeEventListener(eventName, handler); // unsub
};

export const delegateCb = (cb: EventListener, delegate: string, ctx: Element | Document = document): EventListener => (event) => {
    const match = (event.target as Element).closest(delegate);
    if (match && ctx.contains(match)) cb(event);
}
