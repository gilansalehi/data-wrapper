import { record } from './debug.ts';

declare global {
    interface Event {
        actionTarget?: Element; // set by on() during delegation; lives alongside target/currentTarget
    }
}

export const DWRL_BASE = 'dwrl://data-wrapper/';

export type DWContext = Element | Document | DocumentFragment;
export type Off = () => void; // remove event listener.
export type pURL = {
    path:     string,
    isRel:    boolean,            // true when source starts with './'
    key:      string | undefined, // ?key= override (used by *list identity)
    params:   URLSearchParams,
    hash:     string,
    host:     string,             // Roadmap: mesh resolution
    protocol: string,             // Roadmap: api:// etc.
}; // returnTypeOf pURL; <-- possible? More concise...

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

// #region path access
// @docs readPath/writePath walk a deep tree along slash-separated paths.
// readPath bottoms out via direct property access — when the root is the
// state Proxy, the first segment hits proxy.get (which parses JSON).
// writePath rebuilds the path with immutable spreads and reassigns the
// root key, so the proxy setter fires once at the root and the framework's
// fan-out handles nested subscribers.
export const readPath = (obj: unknown, path: string): unknown => {
    if (!path) return obj;
    return path.split('/').reduce<unknown>(
        (acc, key) => acc == null ? undefined : (acc as Record<string, unknown>)[key],
        obj,
    );
};

export const writePath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
    const [head, ...rest] = path.split('/');
    if (rest.length === 0) { obj[head] = value; return; }

    const current = obj[head];
    const sub = Array.isArray(current)
        ? [...current] : (current && typeof current === 'object')
        ? { ...(current as Record<string, unknown>) } : {};
    writePath(sub as Record<string, unknown>, rest.join('/'), value);
    obj[head] = sub;
};
// #endregion

export const q = (s: string, ctx: DWContext = document) => [...ctx.querySelectorAll(s)];

export const emit = (eventName: string, detail?: unknown, ctx: DWContext = document) => {
    if (ctx instanceof Element) record(eventName, ctx, detail);
    ctx.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail }));
};

export const on = (eventName: string, cb: EventListener, delegate: string | Element = '', ctx: DWContext = document): Off => {
    const handler: EventListener = !delegate ? cb : (e) => {
        const targets = delegate instanceof Element ? [delegate] : q(delegate, ctx);
        const actionTarget = targets.find(t => t.contains(e.target as Element));
        if (!actionTarget) return;
        Object.assign(e, { actionTarget });
        cb(e);
    }

    ctx.addEventListener(eventName, handler);
    return () => ctx.removeEventListener(eventName, handler); // Off
};
