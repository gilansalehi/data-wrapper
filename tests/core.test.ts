// Core contract — the rock-solid tenets the lib commits to, independent of the
// in-flight 004 / scope-refactor work. Each test drives the public surface (a
// ComponentRuntime + wake + the real DOM, or action/flush) and asserts observable
// behavior only, so the implementation underneath stays free to change.
import { test, expect } from 'bun:test';
import {
    ComponentRuntime,
    action,
    flush,
    rootContext,
    wake,
    type Wrapper,
} from '../src/lib/index.ts';

// A detached <data-wrapper> never fires connectedCallback, so each test drives
// wake() explicitly. _unsubs / _listCache come from the element's constructor.
const mount = (
    html:      string,
    module:    Record<string, unknown>,
    instance?: Record<string, unknown>,
): Wrapper => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el.innerHTML = html;
    el._component = new ComponentRuntime(el, module, instance);
    wake(el, rootContext(el));
    return el;
};

const click = (el: Element) =>
    el.dispatchEvent(new Event('click', { bubbles: true }));

// --- the three tokens + the scope model --------------------------------------

test('$ binds a component module export into the DOM', () => {
    const el = mount('<output $text="label"></output>', { label: 'hello' });
    expect(el.querySelector('output')?.textContent).toBe('hello');
});

test('a factory instance binding shadows a module export of the same name', () => {
    const el = mount(
        '<output $text="label"></output>',
        { label: 'module' },
        { label: 'instance' },
    );
    expect(el.querySelector('output')?.textContent).toBe('instance');
});

test('`./key` reads the row item inside *list', () => {
    const el = mount(
        '<ul><template *list="items"><li $text="./label"></li></template></ul>',
        { items: [{ id: 1, label: 'a' }, { id: 2, label: 'b' }] },
    );
    expect([...el.querySelectorAll('li')].map(li => li.textContent)).toEqual(['a', 'b']);
});

// --- reactivity --------------------------------------------------------------

test('mutating state in an action updates the bound DOM on flush', () => {
    let n = 0;
    const bump = action(() => { n += 1; });
    const el = mount('<output $text="n"></output>', { get n() { return n; }, bump });

    expect(el.querySelector('output')?.textContent).toBe('0');
    bump();
    flush();
    expect(el.querySelector('output')?.textContent).toBe('1');
});

// --- events ------------------------------------------------------------------

test('@event invokes the matching component action', () => {
    let hits = 0;
    const el = mount('<button @click="hit"></button>', { hit: () => { hits += 1; } });

    click(el.querySelector('button')!);
    expect(hits).toBe(1);
});

// --- structural directive ----------------------------------------------------

test('*if adds its body when truthy and removes it when falsy', () => {
    let show = true;
    const toggle = action(() => { show = !show; });
    const el = mount(
        '<div><template *if="show"><span class="body"></span></template></div>',
        { get show() { return show; }, toggle },
    );

    expect(el.querySelector('.body')).not.toBeNull();
    toggle();
    flush();
    expect(el.querySelector('.body')).toBeNull();
});
