// Core mechanics — reactivity and the structural directives: the rock-solid
// tenets that tests/resolution.test.ts does not cover. Driven through the runtime
// harness and real DOM; assertions are observable behavior only, so the
// implementation underneath stays free to change.
import { test, expect } from 'bun:test';
import { ComponentRuntime } from '../src/lib/component.ts';
import { rootContext, wake, type Wrapper } from '../src/lib/engine.ts';
import {
    DW_DIRECTIVES,
    action,
    flush,
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

test('mutating state in an action updates the bound DOM after the call returns', async () => {
    let n = 0;
    const bump = action(() => { n += 1; });
    const el = mount('<output $text="n"></output>', { get n() { return n; }, bump });

    expect(el.querySelector('output')?.textContent).toBe('0');
    bump();
    await Promise.resolve();
    expect(el.querySelector('output')?.textContent).toBe('1');
});

test('action() wraps each function in an object independently', async () => {
    let n = 0;
    const actions = action({
        inc() { n += 1; },
        dec() { n -= 1; },
    });
    const el = mount('<output $text="n"></output>', { get n() { return n; }, ...actions });

    actions.inc();
    await Promise.resolve();
    expect(el.querySelector('output')?.textContent).toBe('1');

    actions.dec();
    await Promise.resolve();
    expect(el.querySelector('output')?.textContent).toBe('0');
});

test('action(action(fn)) returns the already wrapped function', () => {
    const once = action(() => {});
    expect(action(once)).toBe(once);
});

test('a rejecting async action does not create a floating rejection', async () => {
    const fail = action(async () => {
        throw new Error('nope');
    });

    await expect(fail()).rejects.toThrow('nope');
    await Promise.resolve();
});

test('an external action-wrapped writer flushes consuming runtimes', async () => {
    let n = 0;
    const write = action(() => { n += 1; });
    const el = mount('<output $text="n"></output>', { get n() { return n; } });

    write();
    await Promise.resolve();

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

test('*list renders, reorders, and removes rows from a compact template', () => {
    let items = [
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
    ];
    const setItems = action((next: typeof items) => { items = next; });
    const el = wrapperWithRuntime({ get items() { return items; }, setItems });
    const li = document.createElement('li');
    li.setAttribute('$text', './label');
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'items', li));
    el.append(ul);
    wake(el, rootContext(el));

    expect(rowText(el)).toEqual(['a', 'b', 'c']);

    setItems([
        { id: 3, label: 'C' },
        { id: 1, label: 'A' },
    ]);
    flush();

    expect(rowText(el)).toEqual(['C', 'A']);
});

test('removing a row tears down subscriptions created by nested lists', () => {
    let cleaned = 0;
    DW_DIRECTIVES.set('track-011', ({ cleanup }) => {
        cleanup(() => { cleaned += 1; });
        return () => {};
    });

    let groups = [
        { id: 1, children: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    ];
    const setGroups = action((next: typeof groups) => { groups = next; });
    const el = wrapperWithRuntime({ get groups() { return groups; }, setGroups });
    const span = document.createElement('span');
    span.setAttribute('*track-011', './label');
    const li = document.createElement('li');
    li.append(structuralTemplate('list', './children', span));
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'groups', li));
    el.append(ul);

    try {
        wake(el, rootContext(el));
        expect(cleaned).toBe(0);

        setGroups([]);
        flush();

        expect(cleaned).toBe(2);
    } finally {
        DW_DIRECTIVES.delete('track-011');
    }
});

test('wake skips SVG subtrees', () => {
    const el = wrapperWithRuntime({ label: 'blocked' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('$class', 'label');
    svg.append(text);
    el.append(svg);

    expect(() => wake(el, rootContext(el))).not.toThrow();
    expect(text.hasAttribute('_live')).toBe(false);
    expect(text.getAttribute('class')).toBeNull();
});

// --- events ------------------------------------------------------------------

test('@event modifiers prevent default, stop propagation, and stop later listeners', () => {
    let reported = false;
    let bubbled = false;
    let later = false;
    const el = wrapperWithRuntime({
        report() { reported = true; },
    });
    const button = document.createElement('button');
    button.setAttribute('@click', 'report?prevent&stop&immediate');
    el.append(button);
    wake(el, rootContext(el));
    el.addEventListener('click', () => { bubbled = true; });
    button.addEventListener('click', () => { later = true; });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const allowed = button.dispatchEvent(event);

    expect(reported).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(allowed).toBe(false);
    expect(bubbled).toBe(false);
    expect(later).toBe(false);
});

test('@event actions named like native events run once', () => {
    let calls = 0;
    let original: Event | undefined;
    const el = wrapperWithRuntime({
        click(event: CustomEvent<{ originalEvent: Event }>) {
            calls += 1;
            original = event.detail.originalEvent;
        },
    });
    const button = document.createElement('button');
    button.setAttribute('@click', 'click');
    el.append(button);
    wake(el, rootContext(el));

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(calls).toBe(1);
    expect(original).toBeInstanceOf(MouseEvent);
});

test('@event bindings can listen to custom events', () => {
    let calls = 0;
    let original: Event | undefined;
    const el = wrapperWithRuntime({
        handle(event: CustomEvent<{ originalEvent: Event }>) {
            calls += 1;
            original = event.detail.originalEvent;
        },
    });
    const button = document.createElement('button');
    button.setAttribute('@select', 'handle');
    el.append(button);
    wake(el, rootContext(el));

    button.dispatchEvent(new CustomEvent('select', { bubbles: true }));

    expect(calls).toBe(1);
    expect(original).toBeInstanceOf(CustomEvent);
});
