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

describe('connect lifecycle', () => {
    it('does not execute ordinary inline scripts by default', () => {
        (globalThis as Record<string, unknown>).__plainScriptRan = false;

        make(`<script>globalThis.__plainScriptRan = true;</script>`);

        expect((globalThis as Record<string, unknown>).__plainScriptRan).toBe(false);
    });

    it('emits dw/ready after dw/load', async () => {
        const order: string[] = [];
        document.body.addEventListener('dw/load',  () => order.push('dw/load'),  { once: true });
        document.body.addEventListener('dw/ready', () => order.push('dw/ready'), { once: true });

        make();
        await tick();

        expect(order).toEqual(['dw/load', 'dw/ready']);
    });

    it('native load is non-bubbling while dw/load bubbles', () => {
        let loadOnBody   = false;
        let dwLoadOnBody = false;
        document.body.addEventListener('load',    () => { loadOnBody   = true; }, { once: true });
        document.body.addEventListener('dw/load', () => { dwLoadOnBody = true; }, { once: true });

        make();

        expect(loadOnBody).toBe(false);
        expect(dwLoadOnBody).toBe(true);
    });

    it('emits dw/disconnect when removed', () => {
        const wrapper = make();
        let fired = false;
        wrapper.addEventListener('dw/disconnect', () => { fired = true; });

        wrapper.remove();

        expect(fired).toBe(true);
    });
});

describe('load lifecycle', () => {
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

    it('loads HTML and wakes its bindings', async () => {
        mockResponse(`<p $text="/loaded"></p>`);
        const wrapper = make();
        wrapper.state.loaded = 'yes';

        await wrapper.load('http://localhost/test.html');

        expect(wrapper.querySelector('p')?.textContent).toBe('yes');
    });

    it('emits dw/loaded before dw/ready in the auto-load path', async () => {
        mockResponse(`<p>loaded</p>`);
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

    it('emits dw/error and rejects when fetch fails', async () => {
        mockResponse('Not found', false);
        const wrapper = make();
        let errorDetail: { src?: string; error?: unknown } = {};
        wrapper.addEventListener('dw/error', (e) => {
            errorDetail = (e as CustomEvent).detail;
        }, { once: true });

        await expect(wrapper.load('http://localhost/missing.html')).rejects.toThrow();

        expect(errorDetail.src).toContain('http://localhost/missing.html');
        expect((errorDetail.error as Error).message).toContain('500');
    });
});
