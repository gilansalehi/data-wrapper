import { publish, subscribe } from './engine.ts';
import type { Source, Station, Sub } from './registry.ts';
import type { Off } from './utils.ts';

export type ComponentModule = Readonly<Record<string, unknown>>;

export type ComponentTransaction = <Args extends unknown[], Result>(
    fn: (...args: Args) => Result,
) => (...args: Args) => Result;

export type ComponentCleanup = () => void | Promise<void>;

export type ComponentContext = Readonly<{
    root:        Element;
    signal:      AbortSignal;
    flush:       () => void;
    transaction: ComponentTransaction;
}>;

type Output = {
    read:  () => unknown;
    value: unknown;
};

type ActiveAction = {
    refs:    number;
    handler: EventListener;
};

const own = (obj: object, key: PropertyKey) =>
    Object.prototype.hasOwnProperty.call(obj, key);

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { then?: unknown }).then === 'function';

// @docs Synchronizes one loaded component module with its active DOM sinks.
// A bare binding activates an output by name. Direct exports are read from the
// live module namespace; function exports are invoked as synchronous readers.
// Flushes read only active outputs, compare with Object.is, and publish changed
// values through a Station. Actions and transactions are managed flush
// boundaries, so module-local `export let` state reaches subscribers without a
// copied state object or dependency graph.
// `mount(context)` runs after the loaded DOM is awake and may return a cleanup.
// Destruction aborts the context signal, removes runtime-owned subscriptions
// and actions, runs mount cleanup, then invokes `destroy(context)` exactly once.
export class ComponentRuntime {
    readonly root:    Element;
    readonly module:  ComponentModule;
    readonly station: Station = {};
    readonly context: ComponentContext;

    private readonly outputs = new Map<string, Output>();
    private readonly actions = new Map<string, ActiveAction>();
    private readonly abort   = new AbortController();
    private readonly cleanups: ComponentCleanup[] = [];
    private flushing = false;
    private pending  = false;
    private destroyed = false;
    private mounting?: Promise<void>;
    private destroying?: Promise<void>;

    constructor(root: Element, module: ComponentModule) {
        this.root   = root;
        this.module = module;

        this.context = Object.freeze({
            root,
            signal: this.abort.signal,
            flush: () => this.flush(),
            transaction: (<Args extends unknown[], Result>(fn: (...args: Args) => Result) =>
                this.transaction(fn)) as ComponentTransaction,
        });
    }

    has(name: string): boolean {
        return own(this.module, name);
    }

    source(name: string): Source {
        return {
            read:      ()   => this.read(name),
            write:     ()   => {},
            subscribe: (cb) => this.subscribe(name, cb),
            // The component Station is separate from wrapper and row Stations,
            // so every binding must retain its Off for structural teardown.
            escapes: true,
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

            // A structural subscriber can activate an output while a flush is
            // publishing. Settle once more so that new output participates in
            // the same synchronization boundary.
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
        if (this.destroyed) return;
        if (this.flushing) {
            this.pending = true;
            return;
        }

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

    runAction(name: string, event: Event): unknown {
        const action = this.module[name];
        if (typeof action !== 'function') {
            throw new Error(`Component action "${name}" is not an exported function`);
        }
        return this.boundary(() => action(event, this.context));
    }

    activateAction(name: string): Off | null {
        if (typeof this.module[name] !== 'function') return null;

        let active = this.actions.get(name);
        if (!active) {
            const handler: EventListener = event => {
                const target = event.target;
                if (
                    this.root.matches('data-wrapper')
                    && target instanceof Element
                    && target.closest('data-wrapper') !== this.root
                ) return;

                this.runAction(name, event);
            };
            active = { refs: 0, handler };
            this.actions.set(name, active);
            this.root.addEventListener(name, handler);
        }
        active.refs += 1;

        let live = true;
        return () => {
            if (!live) return;
            live = false;
            if (--active!.refs > 0) return;
            this.root.removeEventListener(name, active!.handler);
            this.actions.delete(name);
        };
    }

    transaction<Args extends unknown[], Result>(
        fn: (...args: Args) => Result,
    ): (...args: Args) => Result {
        return (...args: Args) => this.boundary(() => fn(...args));
    }

    mount(): Promise<void> {
        if (this.mounting) return this.mounting;
        if (this.destroyed) return Promise.resolve();

        this.mounting = this.runMount();
        return this.mounting;
    }

    destroy(): Promise<void> {
        if (this.destroying) return this.destroying;
        this.destroyed = true;
        this.abort.abort();
        this.outputs.clear();
        for (const [name, active] of this.actions) {
            this.root.removeEventListener(name, active.handler);
        }
        this.actions.clear();
        for (const name in this.station) delete this.station[name];

        this.destroying = this.runDestroy();
        return this.destroying;
    }

    private reader(name: string): () => unknown {
        if (!this.has(name)) {
            throw new Error(`Component output "${name}" is not exported`);
        }

        return () => {
            const value = this.module[name];
            return typeof value === 'function'
                ? value(this.context)
                : value;
        };
    }

    private boundary<Result>(invoke: () => Result): Result {
        let result: Result;
        try {
            result = invoke();
        } finally {
            this.flush();
        }

        if (!isThenable(result)) return result;
        return Promise.resolve(result).finally(() => this.flush()) as Result;
    }

    private async runMount(): Promise<void> {
        const hook = this.module.mount;
        if (hook === undefined) return;
        if (typeof hook !== 'function') {
            throw new Error('Component lifecycle export "mount" is not a function');
        }

        const cleanup = await this.boundary(() => hook(this.context));
        if (cleanup === undefined) return;
        if (typeof cleanup !== 'function') {
            throw new Error('Component lifecycle export "mount" must return a cleanup function or nothing');
        }

        this.cleanups.push(cleanup as ComponentCleanup);
    }

    private async runDestroy(): Promise<void> {
        try {
            await this.mounting;
        } catch {
            // A mount error is reported by the loader. Destruction still owns
            // any cleanup mount registered before failing.
        }

        let firstError: unknown;
        for (const cleanup of this.cleanups.splice(0).reverse()) {
            try {
                await cleanup();
            } catch (error) {
                firstError ??= error;
            }
        }

        const hook = this.module.destroy;
        if (hook !== undefined) {
            if (typeof hook !== 'function') {
                firstError ??= new Error('Component lifecycle export "destroy" is not a function');
            } else {
                try {
                    await hook(this.context);
                } catch (error) {
                    firstError ??= error;
                }
            }
        }

        if (firstError !== undefined) throw firstError;
    }
}
