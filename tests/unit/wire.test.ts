import { describe, it, expect, beforeEach, spyOn } from '@tests/helpers.ts';
import { DW_DIRECTIVES } from '@lib/registry.ts';
import { wake, publish, unwire } from '@lib/engine.ts';
import type { Row, Sub, Wrapper } from '@lib/engine.ts';
import { ComponentRuntime } from '@lib/component-runtime.ts';

type TestWrapper = Wrapper & HTMLElement;

const makeWrapper = (): TestWrapper => {
    const el = document.createElement('data-wrapper') as TestWrapper;
    el.state      = {};
    el._subs      = {};
    el._unsubs    = [];
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
    it('resolves an exported bare name through the component runtime', () => {
        let title = 'Module title';
        const wrapper = makeWrapper();
        wrapper.state.title = 'Wrapper title';
        wrapper.innerHTML = '<span $text="title"></span>';
        const runtime = new ComponentRuntime(wrapper, {
            get title() { return title; },
        });
        wrapper._component = runtime;

        wake(wrapper);
        title = 'Updated module title';
        runtime.flush();

        expect(wrapper.querySelector('span')?.textContent).toBe('Updated module title');
        expect(runtime.station.title).toHaveLength(1);
        expect(wrapper._subs.title).toBeUndefined();
    });

    it('applies formatter pipelines to component outputs', () => {
        const wrapper = makeWrapper();
        wrapper.innerHTML = '<span $text="title?upper"></span>';
        wrapper._component = new ComponentRuntime(wrapper, { title: 'module title' });

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('MODULE TITLE');
    });

    it('keeps explicit pURLs routed to wrapper state when an export has the same name', () => {
        const wrapper = makeWrapper();
        wrapper.state.title = 'Wrapper title';
        wrapper.innerHTML = '<span $text="/title"></span>';
        const runtime = new ComponentRuntime(wrapper, { title: 'Module title' });
        wrapper._component = runtime;

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('Wrapper title');
        expect(wrapper._subs.title).toHaveLength(1);
        expect(runtime.station.title).toBeUndefined();
    });

    it('keeps missing bare exports routed to legacy wrapper state', () => {
        const wrapper = makeWrapper();
        wrapper.state.title = 'Wrapper title';
        wrapper.innerHTML = '<span $text="title"></span>';
        wrapper._component = new ComponentRuntime(wrapper, { count: 0 });

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('Wrapper title');
        expect(wrapper._subs.title).toHaveLength(1);
    });

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

    it('dispatches param keys directly to named formatters with their value as arg', () => {
        const wrapper = appendWrapper('<span $text="/name?upper"></span>');
        wrapper.state.name = 'ali';

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('ALI');
    });

    it('runs formatter pipeline in URL-string order, left to right', () => {
        // `where` filters to active items, `length` counts them.
        const wrapper = appendWrapper('<span $text="/todos?where=!done&length"></span>');
        wrapper.state.todos = [
            { id: 1, done: true },
            { id: 2, done: false },
            { id: 3, done: false },
        ];

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('2');
    });

    it('mixes legacy format=NAME entries with direct key=arg entries', () => {
        const wrapper = appendWrapper('<span $text="/name?format=trim&upper"></span>');
        wrapper.state.name = '  ali  ';

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('ALI');
    });

    it('skips reserved framework params in the formatter pipeline', () => {
        // `key` is reserved for *list identity; it must not be treated
        // as a formatter named `key`. The binding falls through to its
        // raw value.
        const wrapper = appendWrapper('<span $text="/name?key=id"></span>');
        wrapper.state.name = 'Ali';

        wake(wrapper);

        expect(wrapper.querySelector('span')?.textContent).toBe('Ali');
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
        const row: Row = { node, item, subs: {}, unsubs: [] };
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
    it('resolves a bare * directive through the component runtime', () => {
        let visible = false;
        const wrapper = makeWrapper();
        wrapper.innerHTML = '<p>Shown</p>';
        wrapper.querySelector('p')!.setAttribute('*if', 'visible');
        const runtime = new ComponentRuntime(wrapper, {
            get visible() { return visible; },
        });
        wrapper._component = runtime;
        document.body.appendChild(wrapper);

        wake(wrapper);
        expect(wrapper.querySelector('p')).toBeNull();

        visible = true;
        runtime.flush();

        expect(wrapper.querySelector('p')?.textContent).toBe('Shown');
        expect(runtime.station.visible).toHaveLength(1);
        expect(wrapper._subs.visible).toBeUndefined();
    });

    it('keeps an explicit * pURL routed to wrapper state', () => {
        const wrapper = makeWrapper();
        wrapper.innerHTML = '<p>Wrapper</p>';
        wrapper.querySelector('p')!.setAttribute('*if', '/visible');
        wrapper.state.visible = false;
        const runtime = new ComponentRuntime(wrapper, { visible: true });
        wrapper._component = runtime;
        document.body.appendChild(wrapper);

        wake(wrapper);

        expect(wrapper.querySelector('p')).toBeNull();
        expect(wrapper._subs.visible).toHaveLength(1);
        expect(runtime.station.visible).toBeUndefined();
    });

    it('renders a component-backed *list with row-relative bindings', () => {
        let items = [{ id: 1, label: 'One' }];
        const wrapper = makeWrapper();
        wrapper.innerHTML = `
            <ul>
                <template><li $text="./label"></li></template>
            </ul>
        `;
        wrapper.querySelector('ul')!.setAttribute('*list', 'items');
        const runtime = new ComponentRuntime(wrapper, {
            get items() { return items; },
        });
        wrapper._component = runtime;
        document.body.appendChild(wrapper);

        wake(wrapper);
        items = [
            { id: 1, label: 'Updated' },
            { id: 2, label: 'Two' },
        ];
        runtime.flush();

        expect([...wrapper.querySelectorAll('li')].map(li => li.textContent))
            .toEqual(['Updated', 'Two']);
        expect(runtime.station.items).toHaveLength(1);
        expect(wrapper._subs.items).toBeUndefined();
    });

    it('invokes an exported bare action and flushes component outputs', () => {
        let count = 0;
        const wrapper = makeWrapper();
        wrapper.innerHTML = `
            <button @click="increment?prevent" value="2"></button>
            <output $text="count"></output>
        `;
        wrapper._component = new ComponentRuntime(wrapper, {
            get count() { return count; },
            increment(event: Event) {
                count += Number((event.target as HTMLButtonElement).value);
            },
        });

        wake(wrapper);
        const button = wrapper.querySelector('button') as HTMLButtonElement;
        const click = new Event('click', { bubbles: true, cancelable: true });
        button.dispatchEvent(click);

        expect(click.defaultPrevented).toBe(true);
        expect(wrapper.querySelector('output')?.textContent).toBe('2');
    });

    it('keeps a missing exported action available to legacy topic listeners', () => {
        const wrapper = makeWrapper();
        wrapper.innerHTML = '<button @click="legacy"></button>';
        wrapper._component = new ComponentRuntime(wrapper, { count: 0 });
        let calls = 0;
        wrapper.addEventListener('legacy', () => { calls += 1; });

        wake(wrapper);
        (wrapper.querySelector('button') as HTMLButtonElement).click();

        expect(calls).toBe(1);
    });

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

describe('escape tracking — unsubs', () => {
    const makeRow = (html: string, item: Record<string, unknown>): Row => {
        const node = document.createElement('li');
        node.innerHTML = html;
        return { node, item, subs: {}, unsubs: [] };
    };

    it('records an absolute $ binding inside a row — it escapes to the wrapper', () => {
        const wrapper = appendWrapper();
        wrapper.state.filter = 'all';
        const row = makeRow('<span $text="/filter"></span>', { filter: 'row-local' });
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.unsubs).toHaveLength(1);
    });

    it('does not record a relative $ binding — it is in-scope, GC-d with the row', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<span $text="./task"></span>', { task: 'Ship it' });
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.unsubs).toHaveLength(0);
        expect(row.subs.task).toHaveLength(1);
    });

    it('records a row @ listener — the delegated listener lands on the wrapper', () => {
        const wrapper = appendWrapper();
        const row = makeRow('<button @click="row/act"></button>', {});
        wrapper.appendChild(row.node);

        wake(row.node, row);

        expect(row.unsubs).toHaveLength(1);
    });

    it('records wrapper-level @ listeners on the wrapper itself', () => {
        const wrapper = appendWrapper('<button @click="topic"></button>');

        wake(wrapper);

        expect(wrapper._unsubs).toHaveLength(1);
    });

    it('unwiring a row detaches its escaped subs from the wrapper Station', () => {
        const wrapper = appendWrapper();
        wrapper.state.filter = 'all';
        const row = makeRow('<span $text="/filter"></span>', {});
        wrapper.appendChild(row.node);

        wake(row.node, row);
        expect(wrapper._subs.filter).toHaveLength(1);

        unwire(row.unsubs);
        expect(wrapper._subs.filter).toHaveLength(0);
    });
});

describe('//host resolution', () => {
    it('a //host $ binding reads the named wrapper\'s state', () => {
        const host = appendWrapper();
        host.id = 'remote';
        host.state.title = 'remote title';
        const consumer = appendWrapper('<span $text="//remote/title"></span>');

        wake(consumer);

        expect(consumer.querySelector('span')?.textContent).toBe('remote title');
    });

    it('a //host subscription lands in the host Station, tracked as a consumer escape', () => {
        const host = appendWrapper();
        host.id = 'remote';
        host.state.title = 'x';
        const consumer = appendWrapper('<span $text="//remote/title"></span>');

        wake(consumer);

        expect(host._subs.title).toHaveLength(1);
        expect(consumer._subs.title).toBeUndefined();
        expect(consumer._unsubs).toHaveLength(1);
    });

    it('host updates flow across wrappers', () => {
        const host = appendWrapper();
        host.id = 'remote';
        host.state.title = 'before';
        const consumer = appendWrapper('<span $text="//remote/title"></span>');

        wake(consumer);
        publish(host._subs, 'title', 'after');

        expect(consumer.querySelector('span')?.textContent).toBe('after');
    });

    it('unwiring the consumer detaches its //host subscription from the host', () => {
        const host = appendWrapper();
        host.id = 'remote';
        host.state.title = 'x';
        const consumer = appendWrapper('<span $text="//remote/title"></span>');

        wake(consumer);
        expect(host._subs.title).toHaveLength(1);

        unwire(consumer._unsubs);
        expect(host._subs.title).toHaveLength(0);
    });

    it('a //host * directive subscribes against the host Station', () => {
        const host = appendWrapper();
        host.id = 'remote';
        host.state.items = 'A';
        const consumer = appendWrapper('<div></div>');
        consumer.querySelector('div')!.setAttribute('*probe', '//remote/items');
        const seen: unknown[] = [];
        DW_DIRECTIVES.set('probe', () => v => { seen.push(v); });

        wake(consumer);
        publish(host._subs, 'items', 'B');

        expect(seen).toEqual(['A', 'B']);
    });

    it('skips a //host binding when the named wrapper is absent', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const consumer = appendWrapper('<span $text="//ghost/title">orig</span>');

        wake(consumer);

        expect(consumer.querySelector('span')?.textContent).toBe('orig');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('a //host @ dispatches its topic on the named wrapper', () => {
        const host = appendWrapper();
        host.id = 'remote';
        const consumer = appendWrapper('<button @click="//remote/act"></button>');
        let target = null as EventTarget | null;
        host.addEventListener('act', e => { target = e.target; });

        wake(consumer);
        consumer.querySelector('button')!.click();

        expect(target).toBe(host);
    });

    it('skips a //host @ when the named wrapper is absent', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const consumer = appendWrapper('<button @click="//ghost/act"></button>');
        let fired = false;
        consumer.addEventListener('act', () => { fired = true; });

        wake(consumer);
        consumer.querySelector('button')!.click();

        expect(fired).toBe(false);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
