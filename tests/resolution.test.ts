// Contract: how a binding name resolves to a value. These drive the real public
// surface — build a runtime, `wake` a wrapper, read the DOM — and never touch
// internal resolver helpers, so the resolution code underneath is free to change.
import { test, expect } from 'bun:test';
import { ComponentRuntime, rootContext, wake, type Wrapper } from '../src/lib/index.ts';

// A detached <data-wrapper> never fires connectedCallback, so each test drives
// wake() explicitly. The element's _unsubs/_listCache come from its constructor.
const mount = (
    html:     string,
    module:   Record<string, unknown>,
    instance?: Record<string, unknown>,
): Wrapper => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el.innerHTML = html;
    el._component = new ComponentRuntime(el, module, instance);
    wake(el, rootContext(el));
    return el;
};

const wrapperWithRuntime = (
    module:   Record<string, unknown>,
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

test('a bare name reads a component module export', () => {
    const el = mount('<output $text="label"></output>', { label: 'hello' });
    expect(el.querySelector('output')?.textContent).toBe('hello');
});

test('a factory instance binding shadows a module export of the same name', () => {
    const el = mount('<output $text="label"></output>', { label: 'module' }, { label: 'instance' });
    expect(el.querySelector('output')?.textContent).toBe('instance');
});

test('a bare name resolves against the nearest row before the component runtime', () => {
    const el = wrapperWithRuntime({
        label: 'module',
        items: [{ id: 1, label: 'row' }],
    });
    const span = document.createElement('span');
    span.setAttribute('$text', 'label');
    el.append(structuralTemplate('list', 'items', span), document.createTextNode(' '));

    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('row');
});

test('a bare name climbs from an inner row to an outer row that owns the key', () => {
    const el = wrapperWithRuntime({
        items: [{ id: 1, label: 'outer', children: [{ id: 'a', detail: 'inner' }] }],
    });
    const span = document.createElement('span');
    span.setAttribute('$text', 'label');
    const inner = structuralTemplate('list', './children', span);
    const article = document.createElement('article');
    article.append(inner, document.createTextNode(' '));
    el.append(structuralTemplate('list', 'items', article), document.createTextNode(' '));

    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('outer');
});

test('a parent-row path reads an outer row from a nested row context', () => {
    const el = wrapperWithRuntime({
        items: [{ id: 1, label: 'outer', children: [{ id: 'a', label: 'inner' }] }],
    });
    const span = document.createElement('span');
    span.setAttribute('$text', '../label');
    const inner = structuralTemplate('list', './children', span);
    const article = document.createElement('article');
    article.append(inner, document.createTextNode(' '));
    el.append(structuralTemplate('list', 'items', article), document.createTextNode(' '));

    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('outer');
});

test('an explicit relative path reads only the nearest row scope', () => {
    const el = wrapperWithRuntime({
        label: 'module',
        items: [{ id: 1, label: 'row' }],
    });
    const span = document.createElement('span');
    span.setAttribute('$text', './label');
    el.append(structuralTemplate('list', 'items', span), document.createTextNode(' '));

    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('row');
});

test('@event detail.item is read from the nearest binding context item', () => {
    let reported: unknown;
    const el = wrapperWithRuntime({
        items: [{ id: 1, label: 'row' }],
        report(event: CustomEvent) {
            reported = event.detail.item;
        },
    });
    const button = document.createElement('button');
    button.setAttribute('@click', 'report');
    el.append(structuralTemplate('list', 'items', button), document.createTextNode(' '));

    wake(el, rootContext(el));
    el.querySelector('button')?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(reported).toEqual({ id: 1, label: 'row' });
});
