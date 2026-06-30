// Ticket 004 — child-wrapper inputs (Phase 3) and the `/key` root escape (Phase 4),
// as contract tests over the public surface.
//
// DOM is built with createElement/setAttribute and template.content.append — the
// same shape the passing resolution suite uses — deliberately NOT innerHTML, which
// happy-dom appears to handle differently for token attributes / <template> bodies.
//
// The full browser loader round-trip remains a smoke-test concern, but these tests
// can stub the browser boundary (`fetch` + import shim) and still exercise the
// public `load()` / `wake()` contract without asserting loader internals.
import { test, expect, spyOn } from 'bun:test';
import {
    ComponentRuntime,
    flush,
    load,
    rootContext,
    wake,
    type ComponentContext,
    type ComponentModule,
    type ComponentProps,
    type Wrapper,
} from '../src/lib/index.ts';

const el = (tag: string, attrs: Record<string, string> = {}, ...kids: Element[]): Element => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...kids);
    return node;
};

const template = (directive: string, source: string, body: Element): HTMLTemplateElement => {
    const tpl = document.createElement('template');
    tpl.setAttribute(`*${directive}`, source);
    tpl.content.append(body);
    return tpl;
};

const mount = (
    body:      Element,
    module:    Record<string, unknown>,
    instance?: Record<string, unknown>,
): Wrapper => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    wrapper.append(body);
    wrapper._component = new ComponentRuntime(wrapper, module, instance);
    wake(wrapper, rootContext(wrapper));
    return wrapper;
};

type ShimGlobal = typeof globalThis & {
    importShim?: (specifier: string) => Promise<ComponentModule>;
    fetch: typeof fetch;
};

const withComponentView = async (
    moduleName: string,
    html:       string,
    module:     ComponentModule,
    run:        () => Promise<void>,
) => {
    const global = globalThis as ShimGlobal;
    const previousFetch = global.fetch;
    const previousShim  = global.importShim;

    global.fetch = (async () => new Response(html, {
        headers: { 'Content-Type': 'text/html' },
    })) as unknown as typeof fetch;
    global.importShim = async specifier => {
        if (specifier !== moduleName) throw new Error(`Unexpected component import ${specifier}`);
        return module;
    };

    try {
        await run();
    } finally {
        global.fetch = previousFetch;
        if (previousShim) global.importShim = previousShim;
        else delete global.importShim;
    }
};

const componentView = (moduleName: string, body: string) => `
<script type="module" data-component data-module="${moduleName}"></script>
${body}
`;

// --- Phase 3: the input channel ----------------------------------------------

test('load delivers src query inputs as factory props, and templates see only factory return values', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const moduleName = '@test/004-props';
    const src = 'http://example.test/card.html?customer&status=orderStatus&start=5&url=query';
    let customer = { firstName: 'Ada' };
    let captured: ComponentProps | undefined;

    const parent = document.createElement('data-wrapper') as unknown as Wrapper;
    parent._component = new ComponentRuntime(parent, {
        get customer() { return customer; },
        get orderStatus() { return 'active'; },
    });

    const child = document.createElement('data-wrapper') as unknown as Wrapper;
    const html = componentView(moduleName, `
<h3 id="name" $text="exposedCustomer/firstName"></h3>
<p id="status" $text="status"></p>
<output id="start" $text="start"></output>
<code id="unexposed" $text="customer/firstName"></code>
`);
    const module: ComponentModule = {
        default: (ctx: ComponentContext) => {
            captured = ctx.props;
            return {
                exposedCustomer: ctx.props.customer,
                status: ctx.props.status,
                start: ctx.props.start,
            };
        },
    };

    try {
        await withComponentView(moduleName, html, module, async () => {
            await load(child, src, rootContext(parent));
        });

        expect(typeof captured?.customer).toBe('function');
        expect(typeof captured?.status).toBe('function');
        expect(captured?.start).toBe('5');
        expect(captured?.url).toBe(src);
        expect(child.querySelector('#name')?.textContent).toBe('Ada');
        expect(child.querySelector('#status')?.textContent).toBe('active');
        expect(child.querySelector('#start')?.textContent).toBe('5');
        expect(child.querySelector('#unexposed')?.textContent).toBe('customer/firstName');

        customer = { firstName: 'Grace' };
        flush();
        expect(child.querySelector('#name')?.textContent).toBe('Grace');
    } finally {
        warn.mockRestore();
    }
});

test('child wrappers inside *list receive props from the row mount point', async () => {
    const moduleName = '@test/004-row-props';
    const src = 'http://example.test/row-card.html?customer';
    const parent = document.createElement('data-wrapper') as unknown as Wrapper;
    parent._component = new ComponentRuntime(parent, {
        rows: [
            { id: 1, customer: { firstName: 'Ada' } },
            { id: 2, customer: { firstName: 'Grace' } },
        ],
    });
    parent.append(template('list', 'rows', el('article', {}, el('data-wrapper', { src }))));
    const html = componentView(moduleName, '<h3 $text="customer/firstName"></h3>');
    const module: ComponentModule = {
        default: (ctx: ComponentContext) => ({ customer: ctx.props.customer }),
    };

    const loads: Promise<void>[] = [];
    await withComponentView(moduleName, html, module, async () => {
        wake(parent, rootContext(parent), (wrapper, childSrc, ctx) => {
            const promise = Promise.resolve(load(wrapper, childSrc, ctx));
            loads.push(promise);
            return promise;
        });
        await Promise.all(loads);
    });

    expect([...parent.querySelectorAll('data-wrapper h3')].map(h => h.textContent))
        .toEqual(['Ada', 'Grace']);
});

test('child wrapper props can address the parent row with `../`', async () => {
    const moduleName = '@test/008-parent-row-props';
    const src = 'http://example.test/row-card.html?customer=../customer';
    const parent = document.createElement('data-wrapper') as unknown as Wrapper;
    parent._component = new ComponentRuntime(parent, {
        rows: [
            { id: 1, customer: { firstName: 'Ada' }, items: [{ id: 'a' }] },
            { id: 2, customer: { firstName: 'Grace' }, items: [{ id: 'b' }] },
        ],
    });

    parent.append(template(
        'list',
        'rows',
        el('section', {}, template('list', './items', el('data-wrapper', { src }))),
    ));

    const html = componentView(moduleName, '<h3 $text="customer/firstName"></h3>');
    const module: ComponentModule = {
        default: (ctx: ComponentContext) => ({ customer: ctx.props.customer }),
    };

    const loads: Promise<void>[] = [];
    await withComponentView(moduleName, html, module, async () => {
        wake(parent, rootContext(parent), (wrapper, childSrc, ctx) => {
            const promise = Promise.resolve(load(wrapper, childSrc, ctx));
            loads.push(promise);
            return promise;
        });
        await Promise.all(loads);
    });

    expect([...parent.querySelectorAll('data-wrapper h3')].map(h => h.textContent))
        .toEqual(['Ada', 'Grace']);
});

test('child wrapper props can read an explicit cross-wrapper source by id', async () => {
    const moduleName = '@test/009-cross-wrapper-props';
    const src = 'http://example.test/summary.html?total=//cart/total';
    let total = 1;
    const target = document.createElement('data-wrapper') as unknown as Wrapper;
    target.id = 'cart';
    target._component = new ComponentRuntime(target, { get total() { return total; } });
    document.body.append(target);

    const parent = document.createElement('data-wrapper') as unknown as Wrapper;
    parent._component = new ComponentRuntime(parent, {});
    const child = document.createElement('data-wrapper') as unknown as Wrapper;
    const html = componentView(moduleName, '<output $text="total"></output>');
    const module: ComponentModule = {
        default: (ctx: ComponentContext) => ({ total: ctx.props.total }),
    };

    try {
        await withComponentView(moduleName, html, module, async () => {
            await load(child, src, rootContext(parent));
        });

        expect(child.querySelector('output')?.textContent).toBe('1');
        total = 2;
        flush();
        expect(child.querySelector('output')?.textContent).toBe('2');
    } finally {
        target._component?.destroy();
        parent._component?.destroy();
        child._component?.destroy();
        target.remove();
    }
});

// CQ6: `a/b` resolves `a` through the component scope, then reads `b` from that
// value, and re-reads on flush so the nested field stays live.
test('a nested path reads into a component binding and stays live', () => {
    let customer = { firstName: 'Ada' };
    const wrapper = mount(el('h3', { $text: 'customer/firstName' }), { get customer() { return customer; } });

    expect(wrapper.querySelector('h3')?.textContent).toBe('Ada');
    customer = { firstName: 'Grace' };
    flush();
    expect(wrapper.querySelector('h3')?.textContent).toBe('Grace');
});

// --- Phase 4: `/key` root escape ---------------------------------------------

// `/key` bypasses every row scope and resolves at the component/root scope, even
// when the surrounding row owns the same name.
test('`/key` resolves at the root scope, bypassing a row that owns the same name', () => {
    const wrapper = mount(
        template('list', 'rows', el('li', { $text: '/label' })),
        { rows: [{ id: 1, label: 'row-a' }, { id: 2, label: 'row-b' }], label: 'root' },
    );
    expect([...wrapper.querySelectorAll('li')].map(li => li.textContent)).toEqual(['root', 'root']);
});
