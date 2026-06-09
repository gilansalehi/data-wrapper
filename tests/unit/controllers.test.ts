import { describe, it, expect, beforeEach, spyOn } from '@tests/helpers.ts';
import '@lib/component.ts';

interface TestWrapper extends HTMLElement {
    state: Record<string, unknown>;
    load(src?: string | null): Promise<void>;
}

const make = (html = ''): TestWrapper => {
    const el = document.createElement('data-wrapper') as TestWrapper;
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    document.body.innerHTML = '';
});

// #region controller execution
describe('dw/controller — execution', () => {
    it('runs a controller with this === wrapper', async () => {
        const wrapper = make(`
            <script type="dw/controller">
                this.dataset.ran = 'yes';
            </script>
        `);
        await tick();
        expect(wrapper.dataset.ran).toBe('yes');
    });

    it('exposes bound put() and writes to wrapper state', async () => {
        const wrapper = make(`
            <script type="dw/controller">
                put('greeting', 'hello');
            </script>
        `);
        await tick();
        expect(wrapper.state.greeting).toBe('hello');
    });

    it('exposes bound register() so handlers respect the wrapper-ownership filter', async () => {
        const wrapper = make(`
            <button @click="my/action">Click</button>
            <script type="dw/controller">
                register({ 'my/action': () => put('clicked', true) });
            </script>
        `);
        await tick();

        wrapper.querySelector('button')!.click();

        expect(wrapper.state.clicked).toBe(true);
    });

    it('exposes the state proxy directly as `state`', async () => {
        const wrapper = make(`
            <script type="dw/controller">
                this.dataset.preexisting = 'seen';
                this.dataset.alsoSeen = String(state.preexisting === 'seen');
            </script>
        `);
        await tick();
        expect(wrapper.state.alsoSeen).toBe(true);
    });

    it('exposes bound patch / push / pull / get on the controller scope', async () => {
        const wrapper = make(`
            <script type="dw/controller">
                patch('user', { name: 'Ali' });
                push('todos', { id: 1 });
                pull('todos', 1);
                this.dataset.lookedUp = String(get('user/name'));
            </script>
        `);
        await tick();
        expect(wrapper.state.user).toEqual({ name: 'Ali' });
        expect(wrapper.state.todos).toEqual([]);
        expect(wrapper.state.lookedUp).toBe('Ali');
    });

    it('runs after wake() so immediate put() updates live $-bindings', async () => {
        const wrapper = make(`
            <p $text="/msg"></p>
            <script type="dw/controller">
                put('msg', 'live');
            </script>
        `);
        await tick();
        expect(wrapper.querySelector('p')?.textContent).toBe('live');
    });

    it('runs multiple controllers in document order', async () => {
        const wrapper = make(`
            <script type="dw/controller">
                put('seq', (state.seq || '') + 'a');
            </script>
            <script type="dw/controller">
                put('seq', state.seq + 'b');
            </script>
        `);
        await tick();
        expect(wrapper.state.seq).toBe('ab');
    });

    it('removes controller scripts from the DOM', () => {
        const wrapper = make(`
            <script type="dw/controller">/* noop */</script>
        `);
        // Removal happens synchronously in connectedCallback before wake.
        expect(wrapper.querySelector('script[type="dw/controller"]')).toBeNull();
    });
});
// #endregion

// #region controller scoping & filtering
describe('dw/controller — scoping & filtering', () => {
    it('does not execute ordinary <script> tags by default', () => {
        // Sentinel mutated only if the script ran.
        (globalThis as Record<string, unknown>).__plainScriptRan = false;
        make(`
            <script>globalThis.__plainScriptRan = true;</script>
        `);
        // No tick needed — happy-dom never executes innerHTML-inserted scripts.
        expect((globalThis as Record<string, unknown>).__plainScriptRan).toBe(false);
    });

    it('does not execute controllers owned by a nested wrapper', async () => {
        const outer = make(`
            <data-wrapper id="inner">
                <script type="dw/controller">put('innerRan', true);</script>
            </data-wrapper>
            <script type="dw/controller">put('outerRan', true);</script>
        `);
        await tick();
        const inner = document.getElementById('inner') as TestWrapper;
        expect(outer.state.outerRan).toBe(true);
        expect(outer.state.innerRan).toBeUndefined();
        expect(inner.state.innerRan).toBe(true);
    });
});
// #endregion

// #region lifecycle — dw/ready
describe('lifecycle — dw/ready', () => {
    it('fires after controllers complete (inline path)', async () => {
        let readyValue: string | undefined;
        document.body.addEventListener('dw/ready', (e) => {
            readyValue = (e.target as TestWrapper).state.msg as string;
        }, { once: true });

        make(`
            <script type="dw/controller">put('msg', 'done');</script>
        `);
        await tick();

        expect(readyValue).toBe('done');
    });

    it('fires even when there are no controllers', async () => {
        let ready = false;
        document.body.addEventListener('dw/ready', () => { ready = true; }, { once: true });

        make('<p>no controllers</p>');
        await tick();

        expect(ready).toBe(true);
    });
});
// #endregion

// #region lifecycle — load order (dw/load vs dw/ready)
describe('lifecycle — connect-time ordering', () => {
    it('dw/load fires before dw/ready', async () => {
        const order: string[] = [];
        document.body.addEventListener('dw/load',  () => order.push('dw/load'),  { once: true });
        document.body.addEventListener('dw/ready', () => order.push('dw/ready'), { once: true });

        make(`<script type="dw/controller">put('x', 1);</script>`);
        await tick();

        expect(order).toEqual(['dw/load', 'dw/ready']);
    });

    it('load fires non-bubbling; dw/load bubbles', () => {
        let loadOnBody    = false;
        let dwLoadOnBody  = false;
        document.body.addEventListener('load',    () => { loadOnBody   = true; }, { once: true });
        document.body.addEventListener('dw/load', () => { dwLoadOnBody = true; }, { once: true });

        make();

        expect(loadOnBody).toBe(false);
        expect(dwLoadOnBody).toBe(true);
    });
});
// #endregion

// #region lifecycle — dw/error (connect-time)
describe('lifecycle — dw/error from a connect-time controller', () => {
    it('emits dw/error with the thrown error in detail', async () => {
        let caught: { error?: unknown } = {};
        document.body.addEventListener('dw/error', (e) => {
            caught = (e as CustomEvent).detail;
        }, { once: true });

        make(`<script type="dw/controller">throw new Error('boom');</script>`);
        await tick();

        expect(caught.error).toBeInstanceOf(Error);
        expect((caught.error as Error).message).toBe('boom');
    });

    it('a throwing controller does not break the wrapper — wake bindings still work', async () => {
        const wrapper = make(`
            <p $text="/seeded"></p>
            <script type="dw/controller">throw new Error('boom');</script>
        `);
        wrapper.dataset.seeded = 'visible';
        await tick();

        expect(wrapper.querySelector('p')?.textContent).toBe('visible');
    });
});
// #endregion

// #region lifecycle — dw/disconnect
describe('lifecycle — dw/disconnect', () => {
    it('fires when the wrapper is removed from the DOM', () => {
        const wrapper = make();
        let fired = false;
        wrapper.addEventListener('dw/disconnect', () => { fired = true; });

        wrapper.remove();

        expect(fired).toBe(true);
    });
});
// #endregion

// #region lifecycle — load() path (mocked fetch)
describe('lifecycle — load() with src and controllers', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        fetchSpy = spyOn(globalThis, 'fetch');
    });

    const mockResponse = (body: string, ok = true) => {
        fetchSpy.mockImplementation(async () => ({
            ok,
            status: ok ? 200 : 500,
            text:   async () => body,
        } as Response));
    };

    it('runs controllers from src-loaded HTML', async () => {
        mockResponse(`
            <p $text="/loaded"></p>
            <script type="dw/controller">put('loaded', 'yes');</script>
        `);
        const wrapper = make() as TestWrapper;
        await wrapper.load('http://localhost/test.html');

        expect(wrapper.state.loaded).toBe('yes');
        expect(wrapper.querySelector('p')?.textContent).toBe('yes');
        // Controllers stripped from rendered DOM.
        expect(wrapper.querySelector('script[type="dw/controller"]')).toBeNull();
    });

    it('fires dw/loaded before dw/ready in the load path', async () => {
        mockResponse(`<script type="dw/controller">put('x', 1);</script>`);

        // Use the auto-fired load() path: connectedCallback sees `src=""`,
        // queueMicrotasks load(), and skips emitting connect-time `dw/ready`
        // so the one we observe is from the load path.
        const wrapper = document.createElement('data-wrapper') as TestWrapper;
        const order: string[] = [];
        wrapper.addEventListener('dw/loaded', () => order.push('dw/loaded'));
        const ready = new Promise<void>(resolve => {
            wrapper.addEventListener('dw/ready', () => {
                order.push('dw/ready');
                resolve();
            });
        });
        wrapper.setAttribute('src', 'http://localhost/test.html');
        document.body.appendChild(wrapper);
        await ready;

        expect(order).toEqual(['dw/loaded', 'dw/ready']);
    });

    it('emits dw/error and rejects when a controller in loaded HTML throws', async () => {
        mockResponse(`<script type="dw/controller">throw new Error('load-controller-boom');</script>`);
        const wrapper = make() as TestWrapper;
        let errorDetail: { src?: string; error?: unknown } = {};
        wrapper.addEventListener('dw/error', (e) => {
            errorDetail = (e as CustomEvent).detail;
        }, { once: true });

        await expect(wrapper.load('http://localhost/test.html')).rejects.toThrow(/load-controller-boom/);
        expect(errorDetail.src).toContain('http://localhost/test.html');
        expect((errorDetail.error as Error).message).toBe('load-controller-boom');
    });

    it('emits dw/error and rejects when fetch fails', async () => {
        mockResponse('Not found', false);
        const wrapper = make() as TestWrapper;
        let errorDetail: { src?: string; error?: unknown } = {};
        wrapper.addEventListener('dw/error', (e) => {
            errorDetail = (e as CustomEvent).detail;
        }, { once: true });

        await expect(wrapper.load('http://localhost/missing.html')).rejects.toThrow();
        expect((errorDetail.error as Error).message).toContain('500');
    });
});
// #endregion

// #region runScripts defense-in-depth
describe('?run-scripts ignores type="dw/controller" (defense in depth)', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        fetchSpy = spyOn(globalThis, 'fetch');
    });

    it('does not double-execute a controller when ?run-scripts is also set', async () => {
        fetchSpy.mockImplementation(async () => ({
            ok: true,
            status: 200,
            text: async () => `
                <script type="dw/controller">
                    put('seq', (state.seq || '') + 'X');
                </script>
            `,
        } as Response));

        const wrapper = make() as TestWrapper;
        await wrapper.load('http://localhost/test.html?run-scripts');

        // The controller runs exactly once. If runScripts had re-fired it,
        // the seq would be 'XX' (or we'd see two emits — but new scripts
        // inserted via runScripts wouldn't execute in happy-dom anyway).
        expect(wrapper.state.seq).toBe('X');
    });
});
// #endregion
