import { describe, it, expect } from '@tests/helpers.ts';
import { ComponentRuntime } from '@lib/component-runtime.ts';

const root = () => document.createElement('data-wrapper');
const event = () => new CustomEvent('component/action');

describe('ComponentRuntime outputs', () => {
    it('reads live direct exports and publishes changed values', () => {
        let count = 0;
        const runtime = new ComponentRuntime(root(), {
            get count() { return count; },
        });
        const seen: unknown[] = [];
        runtime.subscribe('count', value => seen.push(value));

        count = 1;
        runtime.flush();

        expect(seen).toEqual([0, 1]);
    });

    it('invokes function exports as synchronous readers', () => {
        let count = 2;
        const runtime = new ComponentRuntime(root(), {
            doubled: () => count * 2,
        });
        const seen: unknown[] = [];
        runtime.subscribe('doubled', value => seen.push(value));

        count = 3;
        runtime.flush();

        expect(seen).toEqual([4, 6]);
    });

    it('performs a live one-shot read without changing the published cache', () => {
        let count = 0;
        const runtime = new ComponentRuntime(root(), {
            get count() { return count; },
        });
        const seen: unknown[] = [];
        runtime.subscribe('count', value => seen.push(value));

        count = 1;

        expect(runtime.source('count').read()).toBe(1);
        expect(seen).toEqual([0]);
    });

    it('reads only active outputs', () => {
        let activeReads = 0;
        let unusedReads = 0;
        const runtime = new ComponentRuntime(root(), {
            active: () => ++activeReads,
            unused: () => ++unusedReads,
        });
        runtime.subscribe('active', () => {});

        runtime.flush();

        expect(activeReads).toBe(2);
        expect(unusedReads).toBe(0);
    });

    it('shares one output read across multiple subscribers per flush pass', () => {
        let reads = 0;
        let value = 'initial';
        const runtime = new ComponentRuntime(root(), {
            output: () => { reads += 1; return value; },
        });
        const first: unknown[] = [];
        const second: unknown[] = [];

        runtime.subscribe('output', next => first.push(next));
        runtime.subscribe('output', next => second.push(next));
        value = 'changed';
        runtime.flush();

        expect(reads).toBe(2);
        expect(first).toEqual(['initial', 'changed']);
        expect(second).toEqual(['initial', 'changed']);
    });

    it('publishes only when Object.is reports a changed value', () => {
        let value = Number.NaN;
        const runtime = new ComponentRuntime(root(), {
            get value() { return value; },
        });
        const seen: unknown[] = [];
        runtime.subscribe('value', next => seen.push(next));

        runtime.flush();
        value = 0;
        runtime.flush();
        value = -0;
        runtime.flush();

        expect(seen).toHaveLength(3);
        expect(Number.isNaN(seen[0])).toBe(true);
        expect(Object.is(seen[1], 0)).toBe(true);
        expect(Object.is(seen[2], -0)).toBe(true);
    });

    it('deactivates an output when its last subscriber leaves', () => {
        let reads = 0;
        const runtime = new ComponentRuntime(root(), {
            output: () => ++reads,
        });
        const offFirst  = runtime.subscribe('output', () => {});
        const offSecond = runtime.subscribe('output', () => {});

        offFirst();
        runtime.flush();
        offSecond();
        runtime.flush();

        expect(reads).toBe(2);
        expect(runtime.station.output).toBeUndefined();
    });

    it('does not read an output deactivated earlier in the same flush pass', () => {
        let secondReads = 0;
        let first = 0;
        const runtime = new ComponentRuntime(root(), {
            get first() { return first; },
            second: () => ++secondReads,
        });
        let offSecond = () => {};
        runtime.subscribe('first', value => {
            if (value === 1) offSecond();
        });
        offSecond = runtime.subscribe('second', () => {});

        first = 1;
        runtime.flush();

        expect(secondReads).toBe(1);
    });

    it('settles a reentrant flush request in an additional pass', () => {
        let value = 0;
        let reads = 0;
        const runtime = new ComponentRuntime(root(), {
            output: () => { reads += 1; return value; },
        });
        runtime.subscribe('output', next => {
            if (next === 1) runtime.flush();
        });

        value = 1;
        runtime.flush();

        expect(reads).toBe(3);
    });

    it('throws clearly for a missing output', () => {
        const runtime = new ComponentRuntime(root(), {});

        expect(() => runtime.subscribe('missing', () => {}))
            .toThrow(/output "missing" is not exported/);
    });
});

describe('ComponentRuntime managed boundaries', () => {
    it('activates exported actions through their existing event topics', () => {
        let count = 0;
        const componentRoot = root();
        const runtime = new ComponentRuntime(componentRoot, {
            increment(event: CustomEvent) {
                count += Number(event.detail.amount);
            },
        });
        const off = runtime.activateAction('increment');

        componentRoot.dispatchEvent(new CustomEvent('increment', {
            detail: { amount: 2 },
        }));
        off?.();
        componentRoot.dispatchEvent(new CustomEvent('increment', {
            detail: { amount: 2 },
        }));

        expect(count).toBe(2);
    });

    it('reference-counts duplicate action activations', () => {
        let calls = 0;
        const componentRoot = root();
        const runtime = new ComponentRuntime(componentRoot, {
            increment() { calls += 1; },
        });
        const offFirst  = runtime.activateAction('increment')!;
        const offSecond = runtime.activateAction('increment')!;

        componentRoot.dispatchEvent(new CustomEvent('increment'));
        offFirst();
        componentRoot.dispatchEvent(new CustomEvent('increment'));
        offSecond();
        componentRoot.dispatchEvent(new CustomEvent('increment'));

        expect(calls).toBe(2);
    });

    it('ignores action topics owned by nested wrappers', () => {
        let calls = 0;
        const componentRoot = root();
        const nested = root();
        const button = document.createElement('button');
        nested.appendChild(button);
        componentRoot.appendChild(nested);
        const runtime = new ComponentRuntime(componentRoot, {
            increment() { calls += 1; },
        });
        runtime.activateAction('increment');

        button.dispatchEvent(new CustomEvent('increment', { bubbles: true }));

        expect(calls).toBe(0);
    });

    it('flushes after a synchronous exported action', () => {
        let count = 0;
        const runtime = new ComponentRuntime(root(), {
            get count() { return count; },
            increment() { count += 1; },
        });
        const seen: unknown[] = [];
        runtime.subscribe('count', value => seen.push(value));

        runtime.runAction('increment', event());

        expect(seen).toEqual([0, 1]);
    });

    it('flushes state changed before an action throws, then propagates the error', () => {
        let status = 'idle';
        const runtime = new ComponentRuntime(root(), {
            get status() { return status; },
            remove() {
                status = 'removing';
                throw new Error('failed');
            },
        });
        const seen: unknown[] = [];
        runtime.subscribe('status', value => seen.push(value));

        expect(() => runtime.runAction('remove', event())).toThrow('failed');
        expect(seen).toEqual(['idle', 'removing']);
    });

    it('flushes immediately and again when an async action settles', async () => {
        let status = 'idle';
        let release = () => {};
        const wait = new Promise<void>(resolve => { release = resolve; });
        const runtime = new ComponentRuntime(root(), {
            get status() { return status; },
            async save() {
                status = 'saving';
                await wait;
                status = 'saved';
            },
        });
        const seen: unknown[] = [];
        runtime.subscribe('status', value => seen.push(value));

        const result = runtime.runAction('save', event()) as Promise<void>;
        expect(seen).toEqual(['idle', 'saving']);

        release();
        await result;

        expect(seen).toEqual(['idle', 'saving', 'saved']);
    });

    it('detects and awaits non-Promise thenables', async () => {
        let status = 'idle';
        const runtime = new ComponentRuntime(root(), {
            get status() { return status; },
            save() {
                status = 'saving';
                return {
                    then(resolve: (value: string) => void) {
                        status = 'saved';
                        resolve('done');
                    },
                };
            },
        });
        const seen: unknown[] = [];
        runtime.subscribe('status', value => seen.push(value));

        const result = await runtime.runAction('save', event());

        expect(result).toBe('done');
        expect(seen).toEqual(['idle', 'saving', 'saved']);
    });

    it('wraps out-of-band callbacks in transaction flush boundaries', () => {
        let messages: string[] = [];
        const runtime = new ComponentRuntime(root(), {
            get messages() { return messages; },
        });
        const seen: unknown[] = [];
        runtime.subscribe('messages', value => seen.push(value));
        const receive = runtime.transaction((message: string) => {
            messages = [...messages, message];
            return messages.length;
        });

        const length = receive('hello');

        expect(length).toBe(1);
        expect(seen).toEqual([[], ['hello']]);
    });

    it('passes one stable framework context to readers and actions', () => {
        const componentRoot = root();
        let readerContext: unknown;
        let actionContext: unknown;
        const runtime = new ComponentRuntime(componentRoot, {
            output(context: unknown) {
                readerContext = context;
                return 'ready';
            },
            inspect(_event: Event, context: unknown) {
                actionContext = context;
            },
        });

        runtime.subscribe('output', () => {});
        runtime.runAction('inspect', event());

        expect(readerContext).toBe(runtime.context);
        expect(actionContext).toBe(runtime.context);
        expect(runtime.context.root).toBe(componentRoot);
        expect(runtime.context.signal.aborted).toBe(false);
    });

    it('aborts the context signal and stops flushing after destroy', () => {
        let value = 0;
        const runtime = new ComponentRuntime(root(), {
            get value() { return value; },
        });
        const seen: unknown[] = [];
        runtime.subscribe('value', next => seen.push(next));

        runtime.destroy();
        value = 1;
        runtime.flush();

        expect(runtime.context.signal.aborted).toBe(true);
        expect(runtime.station.value).toBeUndefined();
        expect(seen).toEqual([0]);
    });

    it('throws clearly when an action export is missing or not a function', () => {
        const runtime = new ComponentRuntime(root(), { count: 0 });

        expect(runtime.activateAction('count')).toBeNull();
        expect(() => runtime.runAction('count', event()))
            .toThrow(/action "count" is not an exported function/);
    });
});

describe('ComponentRuntime lifecycle', () => {
    it('runs mount with the stable context and flushes its changes', async () => {
        let status = 'idle';
        let received: unknown;
        const runtime = new ComponentRuntime(root(), {
            get status() { return status; },
            mount(context: unknown) {
                received = context;
                status = 'mounted';
            },
        });
        const seen: unknown[] = [];
        runtime.subscribe('status', value => seen.push(value));

        await runtime.mount();

        expect(received).toBe(runtime.context);
        expect(seen).toEqual(['idle', 'mounted']);
    });

    it('runs mount cleanup before destroy and only destroys once', async () => {
        const order: string[] = [];
        const runtime = new ComponentRuntime(root(), {
            mount() {
                order.push('mount');
                return () => { order.push('cleanup'); };
            },
            destroy() {
                order.push('destroy');
            },
        });

        await runtime.mount();
        await runtime.destroy();
        await runtime.destroy();

        expect(order).toEqual(['mount', 'cleanup', 'destroy']);
        expect(runtime.context.signal.aborted).toBe(true);
    });

    it('awaits async mount cleanup during destroy', async () => {
        const order: string[] = [];
        const runtime = new ComponentRuntime(root(), {
            async mount() {
                order.push('mount');
                return async () => {
                    await Promise.resolve();
                    order.push('cleanup');
                };
            },
            destroy() {
                order.push('destroy');
            },
        });

        await runtime.mount();
        await runtime.destroy();

        expect(order).toEqual(['mount', 'cleanup', 'destroy']);
    });

    it('continues destruction after cleanup failure and reports the first error', async () => {
        const order: string[] = [];
        const runtime = new ComponentRuntime(root(), {
            mount() {
                return () => { order.push('cleanup'); throw new Error('cleanup failed'); };
            },
            destroy() {
                order.push('destroy');
            },
        });

        await runtime.mount();

        await expect(runtime.destroy()).rejects.toThrow('cleanup failed');
        expect(order).toEqual(['cleanup', 'destroy']);
    });

    it('rejects invalid lifecycle export shapes clearly', async () => {
        const invalidMount = new ComponentRuntime(root(), { mount: 'nope' });
        const invalidDestroy = new ComponentRuntime(root(), { destroy: 'nope' });

        await expect(invalidMount.mount()).rejects.toThrow(/export "mount" is not a function/);
        await expect(invalidDestroy.destroy()).rejects.toThrow(/export "destroy" is not a function/);
    });
});
