import { publish, subscribe, type Source, type SourceScope, type Station, type Sub } from './engine.ts';
import { readPath, type Off } from './utils.ts';

// Named exports are the shared module scope. A default-export factory may
// return an instance scope for one mounted wrapper; instance names shadow
// module names.
export type ComponentModule = Readonly<Record<string, unknown>>;
export type ComponentInstance = Readonly<Record<string, unknown>>;
export type ComponentProps = Readonly<Record<string, unknown> & { url: string }>;
export type ComponentContext = Readonly<{
    wrapper: HTMLElement;
    url:     URL;
    params:  URLSearchParams;
    props:   ComponentProps;
    cleanup: (off: Off) => void;
}>;
export type ComponentFactory =
    (context: ComponentContext) => ComponentInstance | void;

type Output = { read: () => unknown; value: unknown };

const own = (obj: object, key: PropertyKey) =>
    Object.prototype.hasOwnProperty.call(obj, key);

const firstPathSegment = (path: string): string =>
    path.split('/')[0] ?? '';

const restPath = (path: string): string => {
    const i = path.indexOf('/');
    return i === -1 ? '' : path.slice(i + 1);
};

// Synchronizes a component module and optional instance with active DOM sinks.
// Each subscribed output is re-read on every flush; changes publish through
// the runtime's Station. Actions run inside a flush boundary so mutations
// reach subscribers without dependency tracking.
export class ComponentRuntime implements SourceScope {
    static readonly all = new Set<ComponentRuntime>();

    readonly root:     Element;
    readonly module:   ComponentModule;
    readonly instance?: ComponentInstance;
    readonly station:  Station = {};

    private readonly outputs = new Map<string, Output>();
    private readonly actions = new Map<string, { refs: number; handler: EventListener }>();
    private flushing = false;
    private pending  = false;

    constructor(root: Element, module: ComponentModule, instance?: ComponentInstance) {
        this.root     = root;
        this.module   = module;
        this.instance = instance;
        ComponentRuntime.all.add(this);
    }

    has(name: string): boolean {
        const key = firstPathSegment(name);
        return this.hasInstance(key) || (key !== 'default' && own(this.module, key));
    }

    source(name: string): Source | null {
        if (!this.has(name)) return null;
        return {
            read:      ()   => this.read(name),
            subscribe: (cb) => this.subscribe(name, cb),
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
        const value = this.exactValue(name);
        if (typeof value !== 'function') return null;

        let active = this.actions.get(name);
        if (!active) {
            // wire's @event invocation goes through the same `action` helper devs
            // use for cross-module mutators. One primitive, two call sites.
            const wrapped = action((...args: unknown[]) => {
                const current = this.exactValue(name);
                if (typeof current !== 'function') {
                    throw new Error(`Component action "${name}" is no longer a function`);
                }
                return current(...args);
            });
            const handler: EventListener = e => {
                if (
                    this.root.matches('data-wrapper')
                    && e.target instanceof Element
                    && e.target.closest('data-wrapper') !== this.root
                ) return;
                wrapped(e);
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

    private hasInstance(name: string): boolean {
        return !!this.instance && own(this.instance, name);
    }

    private exactValue(name: string): unknown {
        return this.hasInstance(name) ? this.instance![name] : this.module[name];
    }

    private value(name: string): unknown {
        const key  = firstPathSegment(name);
        const rest = restPath(name);
        const v    = this.exactValue(key);
        const base = typeof v === 'function' ? (v as () => unknown)() : v;
        return rest ? readPath(base, rest) : base;
    }

    // Namespace access preserves ESM live bindings; instance access triggers
    // any getter returned by the factory. Reader functions run with no args.
    private reader(name: string): () => unknown {
        if (!this.has(name)) {
            throw new Error(`Component binding "${name}" is not exported`);
        }
        return () => {
            return this.value(name);
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
// a single flush at the end of the microtask drain.
let _scheduled = false;
const _scheduleFlush = () => {
    if (_scheduled) return;
    _scheduled = true;
    queueMicrotask(() => { _scheduled = false; flush(); });
};

const ACTION = Symbol('dw:action');
type Fn = (...args: any[]) => any;

// `action(fn)` wraps a function so every call schedules a global flush after
// it returns; if the call returns a Promise, the flush also runs after the
// Promise resolves. `action({a, b})` wraps each value in the object and
// returns a new object of the same shape.
//
// Double-wrap protection via the ACTION marker; double-flush prevention via
// microtask coalescing.
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
