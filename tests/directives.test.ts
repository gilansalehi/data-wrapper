// Custom directive API contract (ticket 007). A directive registered in
// DW_DIRECTIVES is invoked with the DirectiveContext, returns an updater the
// framework drives reactively, can wake nested DOM under the handed context, and
// can register teardown via cleanup(). Driven through wake + the real DOM; DOM is
// built with createElement so token attributes survive.
import { test, expect } from 'bun:test';
import { ComponentRuntime } from '../src/lib/component.ts';
import { rootContext, unwake, wake, type Wrapper } from '../src/lib/engine.ts';
import {
    DW_DIRECTIVES,
    flush,
    type DirectiveContext,
} from '../src/lib/index.ts';

const el = (tag: string, attrs: Record<string, string> = {}, ...kids: Element[]): Element => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...kids);
    return node;
};

const mount = (body: Element, module: Record<string, unknown>): Wrapper => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    wrapper.append(body);
    wrapper._component = new ComponentRuntime(wrapper, module);
    wake(wrapper, rootContext(wrapper));
    return wrapper;
};

test('a custom directive is invoked with the context, and its updater runs reactively', () => {
    let received: DirectiveContext | undefined;
    let rendered: unknown;
    DW_DIRECTIVES.set('probe', dctx => { received = dctx; return v => { rendered = v; }; });
    try {
        let count = 0;
        mount(el('div', { '*probe': 'count' }), { get count() { return count; } });

        expect(received?.el).toBeInstanceOf(Element);
        expect(received?.path).toBe('count');
        expect(received?.ctx).toBeDefined();
        expect(typeof received?.wake).toBe('function');
        expect(typeof received?.cleanup).toBe('function');

        expect(rendered).toBe(0);
        count = 5;
        flush();
        expect(rendered).toBe(5);
    } finally {
        DW_DIRECTIVES.delete('probe');
    }
});

test('a custom directive can wake nested DOM under the handed context', () => {
    DW_DIRECTIVES.set('grow', ({ el, ctx, wake }) => () => {
        const span = document.createElement('span');
        span.setAttribute('$text', 'label');
        el.append(span);
        wake(span, ctx);
    });
    try {
        const wrapper = mount(el('div', { '*grow': 'label' }), { label: 'hi' });
        expect(wrapper.querySelector('span')?.textContent).toBe('hi');
    } finally {
        DW_DIRECTIVES.delete('grow');
    }
});

test('a custom directive registers teardown through cleanup()', () => {
    let cleaned = 0;
    DW_DIRECTIVES.set('track', ({ cleanup }) => { cleanup(() => { cleaned += 1; }); return () => {}; });
    try {
        const wrapper = mount(el('div', { '*track': 'x' }), { x: 1 });
        expect(cleaned).toBe(0);
        unwake(wrapper);
        expect(cleaned).toBe(1);
    } finally {
        DW_DIRECTIVES.delete('track');
    }
});
