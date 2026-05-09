import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { DW_DIRECTIVES } from '@lib/registry.ts';
import { wake } from '@lib/wire.ts';
import type { Row, Sub, Subs, Wrapper } from '@lib/engine.ts';
import { emit } from '@lib/utils.ts';

type TestWrapper = Wrapper & HTMLElement;

const makeWrapper = (): TestWrapper => {
    const el = document.createElement('data-wrapper') as TestWrapper;
    el.state        = {};
    el._subs        = {};
    el._boundEvents = new Set();
    el._listCache   = new Map();
    el._watch       = (path: string, sub: Sub) => {
        (el._subs[path] ??= []).push(sub);
        sub(el.state[path]);
    };
    el._routeEvent  = (eventName: string) => {
        if (el._boundEvents.has(eventName)) return;
        el._boundEvents.add(eventName);

        const attrName = `@${eventName}`;
        el.addEventListener(eventName, e => {
            const delegate = (e.target as Element).closest(`[${CSS.escape(attrName)}]`);
            if (!delegate || delegate.closest('data-wrapper') !== el) return;
            (e as Event & { delegateTarget?: Element | null }).delegateTarget = delegate;
            emit(delegate.getAttribute(attrName)!, e, delegate);
        });
    };
    return el;
};

const appendWrapper = (html = '') => {
    const wrapper = makeWrapper();
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    return wrapper;
};

const firstSub = (wrapper: TestWrapper, path: string): Sub => {
    const sub = wrapper._subs[path]?.[0];
    expect(sub).toBeDefined();
    return sub!;
};

beforeEach(() => {
    document.body.innerHTML = '';
    DW_DIRECTIVES.delete('probe');
});

describe('wake bindings', () => {
    it('registers and runs wrapper-scoped $ bindings', () => {
        const wrapper = appendWrapper('<span $text="/name"></span>');
        wrapper.state.name = 'Ali';

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('Ali');
        expect(wrapper._subs.name).toHaveLength(1);
    });

    it('applies formatter chains', () => {
        const wrapper = appendWrapper('<span $text="/name?format=trim&format=upper"></span>');
        wrapper.state.name = '  ali  ';

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('ALI');
    });

    it('skips cross-wrapper paths for now', () => {
        const wrapper = appendWrapper('<span $text="//other/name"></span>');

        wake(wrapper);

        expect(wrapper._subs).toEqual({});
    });

    it('marks wired elements with _live to prevent double wiring', () => {
        const wrapper = appendWrapper(`
            <p>Static</p>
            <span $text="/name"></span>
        `);

        wake(wrapper);
        wake(wrapper);

        expect(wrapper.querySelector('p')?.hasAttribute('_live')).toBe(false);
        expect(wrapper.querySelector('span')?.hasAttribute('_live')).toBe(true);
        expect(wrapper._subs.name).toHaveLength(1);
    });

    it('does not descend into nested data-wrapper elements', () => {
        const wrapper = appendWrapper(`
            <span $text="/outer"></span>
            <data-wrapper>
                <span $text="/inner"></span>
            </data-wrapper>
        `);

        wake(wrapper);

        expect(firstSub(wrapper, 'outer')).toBeDefined();
        expect(wrapper._subs.inner).toBeUndefined();
    });

    it('does not descend into template elements', () => {
        const wrapper = appendWrapper(`
            <span $text="/outside"></span>
            <template>
                <span $text="/inside"></span>
            </template>
        `);

        wake(wrapper);

        expect(firstSub(wrapper, 'outside')).toBeDefined();
        expect(wrapper._subs.inside).toBeUndefined();
    });
});

describe('wake row bindings', () => {
    const makeRow = (html: string, item: Record<string, unknown>) => {
        const node = document.createElement('li');
        node.innerHTML = html;
        const row: Row = { node, item, subs: [] };
        return row;
    };

    it('registers item-scoped $ bindings in row.subs', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span $text="./task"></span>', { task: 'Ship tests' });
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.node.querySelector('span')?.textContent).toBe('Ship tests');
        expect(row.subs).toHaveLength(1);
        expect(wrapper._subs.task).toBeUndefined();
    });

    it('updates item-scoped bindings when row subs run', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span $text="./task"></span>', { task: 'Ship tests' });
        wrapper.appendChild(row.node);

        wake(row.node, row);
        row.subs[0]({ task: 'Updated' });

        expect(row.node.querySelector('span')?.textContent).toBe('Updated');
    });

    it('registers item-scoped directives in row.subs', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span></span>', { visible: true });
        row.node.querySelector('span')!.setAttribute('*probe', './visible');
        wrapper.appendChild(row.node);
        const seen: unknown[] = [];

        DW_DIRECTIVES.set('probe', () => value => { seen.push(value); });

        wake(row.node, row);
        row.subs[0]({ visible: false });

        expect(seen).toEqual([true, false]);
    });

    it('wakes item-scoped children when built-in *if remounts a row node', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<section><span $text="./label"></span></section>', {
            visible: false,
            label: 'Hidden',
        });
        row.node.querySelector('section')!.setAttribute('*if', './visible');
        wrapper.appendChild(row.node);

        wake(row.node, row);
        expect(row.node.querySelector('section')).toBeNull();

        row.item = { visible: true, label: 'Visible' };
        row.subs.forEach(sub => sub(row.item));

        expect(row.node.querySelector('section')).toBeDefined();
        expect(row.node.querySelector('span')?.textContent).toBe('Visible');
    });
});

describe('wake directives and events', () => {
    it('remounts built-in *if nodes with current wrapper-scoped bindings', () => {
        const wrapper = appendWrapper('<p $text="/message"></p>');
        wrapper.querySelector('p')!.setAttribute('*if', '/show');
        wrapper.state.show = false;
        wrapper.state.message = 'Hidden';

        wake(wrapper);
        firstSub(wrapper, 'message')('Updated while hidden');
        firstSub(wrapper, 'show')(true);

        expect(wrapper.querySelector('p')?.textContent).toBe('Updated while hidden');
    });

    it('continues wiring siblings after a structural directive removes a node', () => {
        const wrapper = appendWrapper('<span></span><button @click="topic"></button>');
        wrapper.querySelector('span')!.setAttribute('*if', '/show');
        wrapper.state.show = false;
        let fired = false;
        wrapper.addEventListener('topic', () => { fired = true; });

        wake(wrapper);
        wrapper.querySelector('button')!.click();

        expect(fired).toBe(true);
    });

    it('registers wrapper-scoped directives as subscribers', () => {
        const wrapper = appendWrapper('<span></span>');
        wrapper.querySelector('span')!.setAttribute('*probe', '/name');
        wrapper.state.name = 'Ali';
        const seen: unknown[] = [];

        DW_DIRECTIVES.set('probe', () => value => { seen.push(value); });

        wake(wrapper);
        firstSub(wrapper, 'name')('Bo');

        expect(seen).toEqual(['Ali', 'Bo']);
    });

    it('wires @click events through wrapper event routing', () => {
        const wrapper = appendWrapper('<button @click="topic"></button>');
        let fired = false;
        wrapper.addEventListener('topic', () => { fired = true; });

        wake(wrapper);
        wrapper.querySelector('button')!.click();

        expect(wrapper._boundEvents.has('click')).toBe(true);
        expect(fired).toBe(true);
    });

    it('passes original event with delegateTarget in CustomEvent.detail', () => {
        const wrapper = appendWrapper('<button @click="topic"><span>Click</span></button>');
        let detail: (Event & { delegateTarget?: Element | null }) | undefined;
        wrapper.addEventListener('topic', e => { detail = (e as CustomEvent).detail; });

        wake(wrapper);
        wrapper.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(detail?.delegateTarget).toBe(wrapper.querySelector('button'));
    });

    it('does not route events owned by nested wrappers', () => {
        const wrapper = appendWrapper(`
            <data-wrapper>
                <button @click="topic"></button>
            </data-wrapper>
        `);
        const inner = wrapper.querySelector('data-wrapper') as TestWrapper;
        inner.state = {};
        inner._subs = {};
        inner._boundEvents = new Set();
        inner._listCache = new Map();
        inner._watch = (_path: string, _sub: Sub) => {};
        inner._routeEvent = wrapper._routeEvent.bind(inner);

        let outerCalls = 0;
        wrapper.addEventListener('topic', () => { outerCalls += 1; });

        wake(wrapper);
        wake(inner);
        inner.querySelector('button')!.click();

        expect(outerCalls).toBe(0);
    });
});
