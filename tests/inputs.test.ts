// Ticket 004 — child-wrapper inputs (Phase 3) and the `/key` root escape (Phase 4),
// as contract tests over the public surface.
//
// DOM is built with createElement/setAttribute and template.content.append — the
// same shape the passing resolution suite uses — deliberately NOT innerHTML, which
// happy-dom appears to handle differently for token attributes / <template> bodies.
//
// Note: the `src` → context.props resolution itself runs inside load() (fetch +
// dynamic import), which happy-dom can't model (ticket 011 blind spot). What these
// pin is the *contract's point* — cross-wrapper liveness and path/scope resolution —
// not the fetch wiring, which is covered by manual smoke.
import { test, expect } from 'bun:test';
import { ComponentRuntime, flush, rootContext, wake, type Wrapper } from '../src/lib/index.ts';

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

// --- Phase 3: the input channel ----------------------------------------------

// The headline 004 promise: a projected input is a live reader backed by the
// parent, so mutating the parent updates the child across the wrapper boundary.
// We construct what `export default ({ props }) => props` yields for `?customer`
// (a reader over the parent source) since load() itself is the happy-dom blind spot.
test('a projected input renders the parent value and stays live across the wrapper boundary', () => {
    let name = 'Ada';
    const parent = new ComponentRuntime(document.createElement('data-wrapper'), {
        get customer() { return name; },
    });
    const source = parent.source('customer')!;

    const wrapper = mount(el('h3', { $text: 'customer' }), {}, { customer: () => source.read() });

    expect(wrapper.querySelector('h3')?.textContent).toBe('Ada');
    name = 'Grace';
    flush();
    expect(wrapper.querySelector('h3')?.textContent).toBe('Grace');
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
