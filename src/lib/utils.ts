export const q = (s: string, ctx: Element | Document | DocumentFragment = document) => [...ctx.querySelectorAll(s)] as Element[];

export const emit = (eventName: string, payload?: unknown, ctx: Element | Document = document) => {
    ctx.dispatchEvent(new CustomEvent(eventName, { detail: payload, bubbles: true }));
};

export const on = (eventName: string, cb: EventListener, delegate = '', ctx: Element | Document = document): () => void => {
    const handler: EventListener = delegate
        ? delegateCb(cb, delegate, ctx)
        : cb;
    ctx.addEventListener(eventName, handler);
    return () => ctx.removeEventListener(eventName, handler);
};

export const delegateCb = (cb: EventListener, delegate: string, ctx: Element | Document = document) => (event: Event) => {
    const e = event as Event & { delegateTarget?: Element | null };
    const match = (event.target as Element).closest(delegate);
    e.delegateTarget = match && (ctx === document || (ctx as Element).contains(match))
        ? match
        : null;
    if (e.delegateTarget) cb(e);
}