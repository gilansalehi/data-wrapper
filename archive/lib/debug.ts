// debug.ts — the framework's debugging surface.
//
// Everything debug-related lives here. Framework code only touches debug
// through `record()` (called from emit). The console is the logger; this
// file decides when to flush and keeps a bounded history for future
// time-travel-style features.
//
// The debugger must never be the source of a bug. `record()` runs on every
// emit — debug on or off — so retaining live nodes here would pin detached
// DOM (and File bytes) long past the point reconcile() expects them
// collected. History therefore holds only *snapshots*: plain, JSON-friendly
// data captured at record time. Nothing in the buffer keeps a node alive.

const VERSION = '0.0.4';
const HISTORY_CAP = 1000;
const SANITIZE_DEPTH = 4;
const TOKENS = '@$*';

// A node reduced to identity — enough to recognise it in a log, holding no
// reference that could keep a detached subtree alive.
export type ElementSnapshot = {
    kind:    'element';
    tag:     string;
    id:      string | null;
    dw:      string[];        // tokenized (@/$/*) attributes, as name="value"
    wrapper: string | null;   // id of the owning <data-wrapper>
};

export type LogEntry = {
    at:     number;
    event:  string;
    ctx:    ElementSnapshot;
    detail: unknown;          // sanitized — see clean()
};

const history: LogEntry[] = [];

// Reduce an Element to identity. The tokenized attributes are the
// framework-relevant signal; everything else a debugger needs is the tag,
// the id, and which wrapper owns it.
const snapshot = (el: Element): ElementSnapshot => ({
    kind:    'element',
    tag:     el.tagName,
    id:      el.id || null,
    dw:      [...el.attributes]
        .filter(a => TOKENS.includes(a.name[0]))
        .map(a => `${a.name}="${a.value}"`),
    wrapper: el.closest('data-wrapper')?.id || null,
});

// Reduce an arbitrary detail payload to plain, retention-safe data. Live
// nodes become snapshots; Events, Files and Blobs become descriptors (never
// the live object — an Event pins its target, a File pins its bytes).
// Recursion is depth-capped so a deep or cyclic payload can't run away.
const clean = (value: unknown, depth = SANITIZE_DEPTH): unknown => {
    if (value == null) return value;

    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (t === 'bigint')   return String(value);
    if (t === 'symbol')   return String(value);
    if (t === 'function') return '[Function]';

    if (value instanceof Element) return snapshot(value);
    if (value instanceof File)    return { kind: 'file', name: value.name, size: value.size, type: value.type };
    if (value instanceof Blob)    return { kind: 'blob', size: value.size, type: value.type };
    if (value instanceof Node)    return { kind: 'node', name: value.nodeName };
    if (value instanceof Event) {
        const e = value as Event & { actionTarget?: Element };
        return {
            kind:   'event',
            type:   e.type,
            target: e.target instanceof Element ? snapshot(e.target) : null,
            action: e.actionTarget ? snapshot(e.actionTarget) : undefined,
        };
    }

    if (depth <= 0) return '[…]';

    if (Array.isArray(value)) return value.map(v => clean(v, depth - 1));

    if (t === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = clean(v, depth - 1);
        }
        return out;
    }

    return String(value);
};

// Called by emit() on every CustomEvent dispatch whose ctx is an Element.
// Always records a snapshot to history; logs to console only when an
// ancestor <data-wrapper[_debug]> is present — the console gets the live
// node (clickable in DevTools), the buffer never does.
export const record = (event: string, ctx: Element, detail: unknown) => {
    history.push({ at: Date.now(), event, ctx: snapshot(ctx), detail: clean(detail) });
    if (history.length > HISTORY_CAP) history.shift();

    const dbg = ctx.closest('data-wrapper[_debug]');
    if (dbg) console.log(`[dw:${dbg.id || '?'}]`, event, { ctx, detail });
};

// Structural view of a wrapper for serialization — avoids importing
// the DataWrapper class (which would form a cycle through utils.ts).
type Inspectable = Element & {
    state: Record<string, unknown>;
    _subs: Record<string, unknown[]>;
};

declare global {
    interface Window {
        dw?: {
            version: string;
            readonly all:     HTMLElement[];
            readonly history: LogEntry[];
            debug(target?: Element): void;
            clear(): void;
            toJSON(): unknown;
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
        // Native JSON.stringify hook. Returns a plain, JSON-friendly view of
        // every wrapper plus a recent-history tail — readable in a chat
        // paste without DOM-element noise.
        toJSON() {
            return {
                version:  VERSION,
                wrappers: this.all.map(w => {
                    const i = w as unknown as Inspectable;
                    return {
                        id:       w.id || null,
                        state:    { ...i.state },
                        channels: Object.keys(i._subs),
                        debug:    w.hasAttribute('_debug'),
                    };
                }),
                history: history.slice(-20).map(e => ({
                    event:   e.event,
                    wrapper: e.ctx.wrapper,
                })),
            };
        },
    };
}
