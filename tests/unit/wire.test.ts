import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { DW_DIRECTIVES } from '@lib/registry.ts';
import { wake } from '@lib/wire.ts';
import { publish } from '@lib/engine.ts';
import type { Row, Sub, Wrapper } from '@lib/engine.ts';

type TestWrapper = Wrapper & HTMLElement;

const makeWrapper = (): TestWrapper => {
    const el = document.createElement('data-wrapper') as TestWrapper;
    el.state      = {};
    el._subs      = {};
    el._listCache = new Map();
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
        const row: Row = { node, item, subs: {} };
        return row;
    };

    it('registers item-scoped $ bindings in row.subs', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span $text="./task"></span>', { task: 'Ship tests' });
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.node.querySelector('span')?.textContent).toBe('Ship tests');
        expect(row.subs.task).toHaveLength(1);
        expect(wrapper._subs.task).toBeUndefined();
    });

    it('routes absolute $ bindings to the wrapper Station even inside a row', () => {
        const wrapper = appendWrapper();
        wrapper.state.filter = 'all';
        const row = makeRow('<span $text="/filter"></span>', { filter: 'row-local' });
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.node.querySelector('span')?.textContent).toBe('all');
        expect(wrapper._subs.filter).toHaveLength(1);
        expect(row.subs.filter).toBeUndefined();
    });

    it('drills nested pURL paths into row item state', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span $text="./user/name"></span>', { user: { name: 'Ali' } });
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.node.querySelector('span')?.textContent).toBe('Ali');
        expect(row.subs['user/name']).toHaveLength(1);
    });

    it('updates item-scoped bindings when row subs run', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span $text="./task"></span>', { task: 'Ship tests' });
        wrapper.appendChild(row.node);

        wake(row.node, row);
        publish(row.subs, 'task', 'Updated');

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
        publish(row.subs, 'visible', false);

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
        for (const channel in row.subs) publish(row.subs, channel, row.item[channel]);

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

        expect(fired).toBe(true);
    });

    it('dispatches the action CustomEvent from the actionTarget element', () => {
        const wrapper = appendWrapper('<button @click="topic"><span>Click</span></button>');
        let target = null as EventTarget | null;
        wrapper.addEventListener('topic', e => { target = e.target; });

        wake(wrapper);
        wrapper.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(target).toBe(wrapper.querySelector('button')!);
    });

});
