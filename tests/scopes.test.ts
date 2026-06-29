// Scope-ladder contract — the resolution rules that complete what
// tests/resolution.test.ts already pins (local-first, inner→outer climb,
// explicit `./`, detail.item). These two lock the remaining fundamentals:
// fall-through to the component, and block-context transparency. Driven through
// wake + the real DOM; no internal resolver is called directly, so the scope
// implementation underneath stays free to change.
import { test, expect } from 'bun:test';
import { ComponentRuntime, rootContext, wake, type Wrapper } from '../src/lib/index.ts';

const mount = (html: string, module: Record<string, unknown>): Wrapper => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el.innerHTML = html;
    el._component = new ComponentRuntime(el, module);
    wake(el, rootContext(el));
    return el;
};

// A bare name a row does not own keeps climbing past the row to the component
// runtime — this is what lets a row template still read component-level state.
test('a bare name inside a row falls through to the component runtime', () => {
    const el = mount(
        '<ul><template *list="items"><li $text="heading"></li></template></ul>',
        { items: [{ id: 1 }, { id: 2 }], heading: 'shared' },
    );
    expect([...el.querySelectorAll('li')].map(li => li.textContent)).toEqual(['shared', 'shared']);
});

// A *if block introduces no scope of its own: bindings inside it resolve against
// the surrounding row, so `./` still reaches the enclosing item.
test('bindings inside *if resolve against the surrounding row', () => {
    const el = mount(
        '<ul><template *list="items">'
        + '<li><template *if="./visible"><span $text="./label"></span></template></li>'
        + '</template></ul>',
        { items: [{ id: 1, label: 'x', visible: true }] },
    );
    expect(el.querySelector('span')?.textContent).toBe('x');
});
