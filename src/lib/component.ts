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
// component's own Station. Actions run inside a sync flush boundary so module
// mutations reach subscribers without dependency tracking.
//
// TODO: async boundary (return-value Promise → flush again on resolve)
// TODO: mount(ctx) / destroy(ctx) lifecycle hook dispatch + cleanup collection
export class ComponentRuntime {
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
        this.context = Object.freeze({ root, flush: () => this.flush() });
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
            const fn = this.module[name] as (e: Event, ctx: ComponentContext) => unknown;
            const handler: EventListener = e => {
                if (
                    this.root.matches('data-wrapper')
                    && e.target instanceof Element
                    && e.target.closest('data-wrapper') !== this.root
                ) return;
                try { fn(e, this.context); }
                finally { this.flush(); }
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
