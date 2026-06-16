import { publish, subscribe, type Source, type Station, type Sub } from './engine.ts';
import type { Off } from './utils.ts';

export type ComponentModule = Readonly<Record<string, unknown>>;

export type ComponentContext = Readonly<{
    root:  Element;
    flush: () => void;
}>;

type Output = { read: () => unknown; value: unknown };

// Synchronizes a loaded module's exports with active DOM sinks.
// Each subscribed output is read on every flush; changes publish through the
// component's own Station. Actions run inside a flush boundary so module
// mutations reach subscribers without dependency tracking.
//
// TODO: mount(ctx) / destroy(ctx) lifecycle hook dispatch + cleanup collection
export class ComponentRuntime {
    static readonly all = new Set<ComponentRuntime>();

    readonly root:    Element;
    readonly module:  ComponentModule;
    readonly station: Station = {};
    readonly context: ComponentContext;

    private readonly outputs = new Map<string, Output>();
    private readonly actions = new Map<string, { refs: number; handler: EventListener }>();
    private flushing = false;
    private pending  = false;

    constructor(root: Element, module: ComponentModule) {
        this.root    = root;
        this.module  = module;
        this.context = Object.freeze({ root, flush });
        ComponentRuntime.all.add(this);
    }

    has(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.module, name);
    }

    source(name: string): Source {
        return {
            read:      ()   => this.read(name),
            subscribe: (cb) => this.subscribe(name, cb),
            escapes:        true,
        };
    }

    read(name: string): unknown {
        return this.reader(name)();
    }

    subscribe(name: string, sub: Sub): Off {
        let output = this.outputs.get(name);
        if (!output) {
            const read = this.reader(name);
            output = { read, value: read() };
            this.outputs.set(name, output);
            if (this.flushing) this.pending = true;
        }
        const off = subscribe(this.station, name, sub, output.value);
        return () => {
            off();
            if (this.station[name]?.length === 0) {
                delete this.station[name];
                this.outputs.delete(name);
            }
        };
    }

    flush(): void {
        if (this.flushing) { this.pending = true; return; }
        this.flushing = true;
        try {
            do {
                this.pending = false;
                for (const [name, output] of [...this.outputs]) {
                    if (this.outputs.get(name) !== output) continue;
                    const value = output.read();
                    if (Object.is(value, output.value)) continue;
                    output.value = value;
                    publish(this.station, name, value);
                }
            } while (this.pending);
        } finally {
            this.flushing = false;
        }
    }

    activateAction(name: string): Off | null {
        if (typeof this.module[name] !== 'function') return null;

        let active = this.actions.get(name);
        if (!active) {
            // wire's @event invocation goes through the same `action` helper devs
            // use for cross-module mutators. One primitive, two call sites.
            const wrapped = action(this.module[name] as (...args: unknown[]) => unknown);
            const handler: EventListener = e => {
                if (
                    this.root.matches('data-wrapper')
                    && e.target instanceof Element
                    && e.target.closest('data-wrapper') !== this.root
                ) return;
                wrapped(e, this.context);
            };
            active = { refs: 0, handler };
            this.actions.set(name, active);
            this.root.addEventListener(name, handler);
        }
        active.refs += 1;

        return () => {
            if (--active!.refs > 0) return;
            this.root.removeEventListener(name, active!.handler);
            this.actions.delete(name);
        };
    }

    destroy(): void {
        ComponentRuntime.all.delete(this);
        this.outputs.clear();
        for (const [name, a] of this.actions) this.root.removeEventListener(name, a.handler);
        this.actions.clear();
        for (const k in this.station) delete this.station[k];
    }

    private reader(name: string): () => unknown {
        return () => {
            const v = this.module[name];
            return typeof v === 'function' ? v(this.context) : v;
        };
    }
}

// --- Public reactivity API ---------------------------------------------------

// Flush every active runtime synchronously: each runtime re-reads its active
// outputs and publishes changed values via Object.is. Devs call this directly
// when their mutation happens outside an `action()`-wrapped call.
export const flush = (): void => {
    for (const r of ComponentRuntime.all) r.flush();
};

// Microtask coalescing: nested action calls within the same task collapse into
// a single flush at the end of the microtask drain. Prevents O(N) flushes from
// N nested actions and makes async-action timing predictable.
let _scheduled = false;
const _scheduleFlush = () => {
    if (_scheduled) return;
    _scheduled = true;
    queueMicrotask(() => { _scheduled = false; flush(); });
};

// Marker symbol so action(action(fn)) is idempotent — wire()'s implicit wrap
// over a dev-wrapped export doesn't re-wrap.
const ACTION = Symbol('dw:action');

type Fn = (...args: unknown[]) => unknown;

// `action(fn)` wraps a function so every call schedules a global flush after
// it returns; if the call returns a Promise, the flush also runs after the
// Promise resolves. `action({a, b})` wraps each value in the object and returns
// a new object of the same shape — convenient for batching state-module exports.
//
// Double-wrap protection via the ACTION marker; double-flush prevention via
// microtask coalescing. Devs can call action() inside other actions without
// fear of N+1 flushes.
export function action<F extends Fn>(fn: F): F;
export function action<T extends Record<string, Fn>>(obj: T): T;
export function action(input: Fn | Record<string, Fn>): Fn | Record<string, Fn> {
    if (typeof input === 'function') {
        if ((input as Fn & { [ACTION]?: true })[ACTION]) return input;
        const wrapped = ((...args: unknown[]) => {
            let result;
            try { result = (input as Fn)(...args); }
            finally { _scheduleFlush(); }
            if (result instanceof Promise) result.finally(_scheduleFlush);
            return result;
        }) as Fn & { [ACTION]: true };
        wrapped[ACTION] = true;
        return wrapped;
    }
    if (input && typeof input === 'object') {
        const out: Record<string, Fn> = {};
        for (const k of Object.keys(input)) out[k] = action(input[k]);
        return out;
    }
    throw new TypeError('action() expects a function or an object of functions');
}
