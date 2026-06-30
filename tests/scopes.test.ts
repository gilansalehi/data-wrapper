// Scope-ladder contract — the resolution rules that complete what
// tests/resolution.test.ts already pins (local-first, inner→outer climb,
// explicit `./`, detail.item). These two lock the remaining fundamentals:
// fall-through to the component, and block-context transparency. Driven through
// wake + the real DOM; no internal resolver is called directly, so the scope
// implementation underneath stays free to change.
import { test, expect, spyOn } from 'bun:test';
import { ComponentRuntime, flush, rootContext, unwake, wake, type Wrapper } from '../src/lib/index.ts';

const wrapperWithRuntime = (module: Record<string, unknown>): Wrapper => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el._component = new ComponentRuntime(el, module);
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

// A bare name a row does not own keeps climbing past the row to the component
// runtime — this is what lets a row template still read component-level state.
test('a bare name inside a row falls through to the component runtime', () => {
    const el = wrapperWithRuntime({ items: [{ id: 1 }, { id: 2 }], heading: 'shared' });
    const li = document.createElement('li');
    li.setAttribute('$text', 'heading');
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'items', li));
    el.append(ul);
    wake(el, rootContext(el));

    expect([...el.querySelectorAll('li')].map(li => li.textContent)).toEqual(['shared', 'shared']);
});

// A *if block introduces no scope of its own: bindings inside it resolve against
// the surrounding row, so `./` still reaches the enclosing item.
test('bindings inside *if resolve against the surrounding row', () => {
    const el = wrapperWithRuntime({ items: [{ id: 1, label: 'x', visible: true }] });
    const span = document.createElement('span');
    span.setAttribute('$text', './label');
    const li = document.createElement('li');
    li.append(structuralTemplate('if', './visible', span));
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'items', li));
    el.append(ul);
    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('x');
});

// --- resolution miss policy (Phase 2) ----------------------------------------

// A dynamic ($/*) binding that resolves nowhere renders the literal name and
// warns — loud but non-fatal, so a typo never silently blanks the view or aborts
// the bindings next to it.
test('an unresolved $ binding renders the literal name, warns, and spares its siblings', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const el = wrapperWithRuntime({ real: 'ok' });
    el.innerHTML = '<div><output id="a" $text="nope"></output><output id="b" $text="real"></output></div>';
    wake(el, rootContext(el));

    expect(el.querySelector('#a')?.textContent).toBe('nope');
    expect(el.querySelector('#b')?.textContent).toBe('ok');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
});

// --- cross-wrapper reads `//id/path` (ticket 009) -----------------------------

// `//id/name` is an explicit escape hatch: it asks the document for a wrapper by
// id, then reads from that wrapper's component scope. It is not a row lookup and
// it stays live through the same flush cycle as local component bindings.
test('`//id/name` reads a loaded wrapper by id and updates on flush', () => {
    let total = 1;
    const target = wrapperWithRuntime({ get total() { return total; } });
    target.id = 'cart';
    const consumer = wrapperWithRuntime({});
    consumer.innerHTML = '<output $text="//cart/total"></output>';
    document.body.append(target, consumer);

    try {
        wake(consumer, rootContext(consumer));
        expect(consumer.querySelector('output')?.textContent).toBe('1');

        total = 2;
        flush();
        expect(consumer.querySelector('output')?.textContent).toBe('2');
    } finally {
        unwake(consumer);
        target._component?.destroy();
        consumer._component?.destroy();
        target.remove();
        consumer.remove();
    }
});

// A cross-wrapper miss is not a local typo, so it does not render a static
// literal. The binding stays untouched and warns so the developer can fix the id,
// load order, or exported path.
test('missing cross-wrapper binding stays inert and warns', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const el = wrapperWithRuntime({});
    el.innerHTML = '<output $text="//missing/up">kept</output>';
    try {
        wake(el, rootContext(el));
        expect(el.querySelector('output')?.textContent).toBe('kept');
        expect(warn).toHaveBeenCalledWith('data-wrapper: unresolved cross-wrapper binding "//missing/up"');
    } finally {
        warn.mockRestore();
        el._component?.destroy();
    }
});

// --- parent-row addressing `../` (ticket 008) ---------------------------------

// `../name` skips the nearest row and reads the parent row. Both rows own
// `label` here, so only `../` (not bare, not `./`) reaches the outer 'outer'.
test('`../name` reads the parent row, not the nearest one', () => {
    const el = wrapperWithRuntime({
        rows: [{ id: 1, label: 'outer', items: [{ id: 'a', label: 'inner' }] }],
    });
    const span = document.createElement('span');
    span.setAttribute('$text', '../label');
    const li = document.createElement('li');
    li.append(structuralTemplate('list', './items', span));
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'rows', li));
    el.append(ul);
    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('outer');
});

// `../name` targets that parent row *only* — it does not climb or fall through to
// the component. A parent row that lacks the name misses (literal + warn) even
// when the component defines it.
test('`../name` resolves the parent row only and does not fall through to the component', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const el = wrapperWithRuntime({
        shared: 'from-component',
        rows: [{ id: 1, items: [{ id: 'a' }] }],
    });
    const span = document.createElement('span');
    span.setAttribute('$text', '../shared');
    const li = document.createElement('li');
    li.append(structuralTemplate('list', './items', span));
    const ul = document.createElement('ul');
    ul.append(structuralTemplate('list', 'rows', li));
    el.append(ul);
    wake(el, rootContext(el));

    expect(el.querySelector('span')?.textContent).toBe('shared');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
});
