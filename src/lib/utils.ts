export type DWRL = URL & {
    url: URL,
    isRel: boolean, // isItemScoped
    key?: string,
    protocol?: string,
    host?: string,
    path?: string,
    params?: URLSearchParams,
};

export const DWRL_BASE = 'dwrl://data-wrapper/';

export const p = (dwrlString: string): DWRL => {
    const isRel = dwrlString.startsWith('./');

    const url = new URL(dwrlString.slice(isRel ? 1 : 0), DWRL_BASE);
    const dwrl = {
        ...url, // URL props are get(prop), not url.prop.
        url,
        key:  url.searchParams.get('key') ?? undefined,
        protocol: url.protocol,
        host: url.hostname,
        path: url.pathname.slice(1),
        params: url.searchParams,
        isRel, // for list directive.
    }

    // DEBUGGING:
    if (url.hash === '#debug') {
        console.info('debug:dwrl', dwrl);
    }

    return dwrl;
}

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