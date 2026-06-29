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

test('a bare name reads a component module export', () => {
    const el = mount('<output $text="label"></output>', { label: 'hello' });
    expect(el.querySelector('output')?.textContent).toBe('hello');
});

test('a factory instance binding shadows a module export of the same name', () => {
    const el = mount('<output $text="label"></output>', { label: 'module' }, { label: 'instance' });
    expect(el.querySelector('output')?.textContent).toBe('instance');
});
