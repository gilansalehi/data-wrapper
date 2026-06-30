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

const wrapperWithRuntime = (
    module:    Record<string, unknown>,
    instance?: Record<string, unknown>,
): Wrapper => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el._component = new ComponentRuntime(el, module, instance);
    return el;
};

const structuralTemplate = (
    directive: string,
    source:    string,
    child:     Element,
): HTMLTemplateElement => {
    const tpl = document.createElement('template');
    tpl.setAttribute(`*${directive}`, source);
    tpl.content.append(child);
    return tpl;
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
    const el = wrapperWithRuntime({ get show() { return show; }, toggle });
    const span = document.createElement('span');
    span.className = 'body';
    const div = document.createElement('div');
    div.append(structuralTemplate('if', 'show', span));
    el.append(div);
    wake(el, rootContext(el));

    expect(el.querySelector('.body')).not.toBeNull();
    toggle();
    flush();
    expect(el.querySelector('.body')).toBeNull();
});

test('*list updates a row in place and removes a dropped row', () => {
    let items = [{ id: 1, label: 'a' }, { id: 2, label: 'b' }];
    const setItems = action((next: typeof items) => { items = next; });
    const el = wrapperWithRuntime({ get items() { return items; }, setItems });
    const li = document.createElement('li');
    li.setAttribute('$text', './label');
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'items', li));
    el.append(ul);
    wake(el, rootContext(el));
    expect(rowText(el)).toEqual(['a', 'b']);

    setItems([{ id: 1, label: 'A' }]);
    flush();
    expect(rowText(el)).toEqual(['A']);
});
