// debug.ts — the framework's debugging surface.
//
// Everything debug-related lives here. Framework code only touches debug
// through `record()` (called from emit). The console is the logger; this
// file decides when to flush and keeps a bounded history for future
// time-travel-style features.

const VERSION = '0.0.4';
const HISTORY_CAP = 1000;

export type LogEntry = {
    at:     number;
    event:  string;
    ctx:    Element;
    detail: unknown;
};

const history: LogEntry[] = [];

// Called by emit() on every CustomEvent dispatch whose ctx is an Element.
// Always records to history; logs to console only when an ancestor
// <data-wrapper[_debug]> is present.
export const record = (event: string, ctx: Element, detail: unknown) => {
    history.push({ at: Date.now(), event, ctx, detail });
    if (history.length > HISTORY_CAP) history.shift();

    const dbg = ctx.closest('data-wrapper[_debug]');
    if (dbg) console.log(`[dw:${dbg.id || '?'}]`, event, { ctx, detail });
};

declare global {
    interface Window {
        dw?: {
            version: string;
            readonly all:     HTMLElement[];
            readonly history: LogEntry[];
            debug(target?: Element): void;
            clear(): void;
        };
    }
}

if (typeof window !== 'undefined' && !window.dw) {
    window.dw = {
        version: VERSION,
        get all()     { return [...document.querySelectorAll<HTMLElement>('data-wrapper')]; },
        get history() { return [...history]; },
        debug(target?: Element) {
            const wrappers = target ? [target] : this.all;
            let enabled = false;
            for (const w of wrappers) {
                if (w.toggleAttribute('_debug')) enabled = true;
            }
            if (enabled) console.log(`<data-wrapper v${VERSION}> debug ON`);
        },
        clear() { history.length = 0; },
    };
}
