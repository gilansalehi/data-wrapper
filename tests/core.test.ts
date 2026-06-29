// Core mechanics — reactivity and the structural directives: the rock-solid
// tenets that tests/resolution.test.ts does not cover. Driven through the public
// surface (ComponentRuntime + wake + action/flush + real DOM); assertions are
// observable behavior only, so the implementation underneath stays free to change.
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

const rowText = (el: Wrapper) =>
    [...el.querySelectorAll('li')].map(li => li.textContent);

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

// --- structural directives ---------------------------------------------------

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

test('*list updates a row in place and removes a dropped row', () => {
    let items = [{ id: 1, label: 'a' }, { id: 2, label: 'b' }];
    const setItems = action((next: typeof items) => { items = next; });
    const el = mount(
        '<ul><template *list="items"><li $text="./label"></li></template></ul>',
        { get items() { return items; }, setItems },
    );
    expect(rowText(el)).toEqual(['a', 'b']);

    setItems([{ id: 1, label: 'A' }]);
    flush();
    expect(rowText(el)).toEqual(['A']);
});
