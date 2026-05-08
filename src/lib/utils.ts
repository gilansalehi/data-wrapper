// ctx broadened to DocumentFragment so q() works on template.content
export const q = (s: string, ctx: Element | Document | DocumentFragment = document) => [...ctx.querySelectorAll(s)] as Element[];

export const emit = (eventName: string, payload?: unknown, ctx: Element | Document = document) => {
    ctx.dispatchEvent(new CustomEvent(eventName, { detail: payload, bubbles: true }));
};

export const on = (eventName: string, cb: EventListener, delegate = '', ctx: Element | Document = document): () => void => {
    const handler: EventListener = delegate
        ? (event: Event) => {
            const e = event as Event & { delegateTarget?: Element | null };
            e.delegateTarget = (event.target as Element).closest(delegate);
            if (e.delegateTarget) cb(e);
        }
        : cb;
    ctx.addEventListener(eventName, handler);
    return () => ctx.removeEventListener(eventName, handler);
};
