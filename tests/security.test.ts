// DOM-safety contract: the generic `$prop` binding must keep the safe sink and
// the dangerous sink distinguishable. `$text` is textContent; raw HTML needs the
// named `$unsafeHTML` opt-in; and `javascript:`-scheme values are neutralized in
// URL attributes. Driven through the real wire/wake path; observable behavior only.
import { test, expect } from 'bun:test';
import { ComponentRuntime } from '../src/lib/component.ts';
import { rootContext, wake, type Wrapper } from '../src/lib/engine.ts';

// Build a wrapper holding one child element with a single token attribute, then
// wake it against a module scope. createElement/append per the harness rule.
const mountChild = (
    tag:    string,
    attr:   string,
    value:  string,
    module: Record<string, unknown>,
): { wrapper: Wrapper; child: Element } => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    const child = document.createElement(tag);
    child.setAttribute(attr, value);
    wrapper.append(child);
    wrapper._component = new ComponentRuntime(wrapper, module);
    wake(wrapper, rootContext(wrapper));
    return { wrapper, child };
};

test('$innerHTML throws so a dev must name the danger', () => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    const child = document.createElement('div');
    child.setAttribute('$innerHTML', 'markup');
    wrapper.append(child);
    wrapper._component = new ComponentRuntime(wrapper, { markup: '<b>x</b>' });

    expect(() => wake(wrapper, rootContext(wrapper))).toThrow(/unsafeHTML/);
});

test('$unsafeHTML is the explicit opt-in and writes raw HTML', () => {
    const { child } = mountChild('div', '$unsafeHTML', 'markup', { markup: '<b>hi</b>' });
    expect(child.querySelector('b')?.textContent).toBe('hi');
});

test('$text writes markup as inert text, never parsed HTML', () => {
    const { child } = mountChild('div', '$text', 'markup', { markup: '<b>hi</b>' });
    expect(child.querySelector('b')).toBeNull();
    expect(child.textContent).toBe('<b>hi</b>');
});

test('a javascript: value is blocked from a URL attribute', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'javascript:alert(1)' });
    expect(child.getAttribute('href')).toBeNull();
});

test('an ordinary URL still binds', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'https://example.com/' });
    expect(child.getAttribute('href')).toBe('https://example.com/');
});
