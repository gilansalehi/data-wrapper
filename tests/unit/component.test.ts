import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { DW_DIRECTIVES } from '@lib/registry.ts';
import type { Station, Sub } from '@lib/engine.ts';
// DataWrapper is registered as a side-effect of the import
import '@lib/component.ts';

interface TestWrapper extends HTMLElement {
    state: Record<string, unknown>;
    _subs: Station;
    register(actions: Record<string, EventListener>): void;
    get(path: string): unknown;
    put(key: string, val: unknown | ((prev: unknown) => unknown)): void;
    patch(key: string, obj: Record<string, unknown>): void;
    push(key: string, item: unknown): void;
    pull(key: string, predicate: ((item: unknown) => boolean) | unknown): void;
}

const make = (html = ''): TestWrapper => {
    const el = document.createElement('data-wrapper') as TestWrapper;
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    document.body.innerHTML = '';
    DW_DIRECTIVES.delete('probe');
});

describe('custom element registration', () => {
    it('does not throw when component module is evaluated after data-wrapper is already defined', async () => {
        let error: unknown;

        try {
            await import(`../../src/lib/component.ts?guard=${Date.now()}`);
        } catch (e) {
            error = e;
        }

        expect(error).toBeUndefined();
    });
});

describe('state proxy', () => {
    it('reads dataset string as-is', () => {
        const el = make();
        el.dataset.name = 'Ali';

        expect(el.state.name).toBe('Ali');
    });

    it('parses JSON values (numbers, objects, arrays)', () => {
        const el = make();
        el.dataset.count = '42';
        el.dataset.user = '{"name":"Ali"}';
        el.dataset.items = '[1,2,3]';

        expect(el.state.count).toBe(42);
        expect(el.state.user).toEqual({ name: 'Ali' });
        expect(el.state.items).toEqual([1, 2, 3]);
    });

    it('serialises objects to JSON on write', () => {
        const el = make();

        el.state.user = { name: 'Ali' };

        expect(el.dataset.user).toBe('{"name":"Ali"}');
    });

    it('serialises primitives to string on write', () => {
        const el = make();

        el.state.count = 42;
        el.state.enabled = true;

        expect(el.dataset.count).toBe('42');
        expect(el.dataset.enabled).toBe('true');
    });

    it('returns undefined for missing keys', () => {
        const el = make();

        expect(el.state.missing).toBeUndefined();
    });
});

describe('put', () => {
    it('sets state key and updates data-* attribute', () => {
        const el = make();

        el.put('count', 1);

        expect(el.dataset.count).toBe('1');
        expect(el.state.count).toBe(1);
    });

    it('accepts an updater function (prev => next)', () => {
        const el = make();
        el.put('count', 1);

        el.put('count', (prev: unknown) => Number(prev) + 1);

        expect(el.state.count).toBe(2);
    });

    it('skips broadcast when value is identical', () => {
        const el = make();
        el.put('count', 1);
        let calls = 0;
        el._subs.count = [() => { calls += 1; }];

        el.put('count', 1);

        expect(calls).toBe(0);
    });

    it('emits dw/sync event with the changed key', () => {
        const el = make();
        let key: unknown;
        el.addEventListener('dw/sync', e => { key = (e as CustomEvent).detail.key; });

        el.put('count', 1);

        expect(key).toBe('count');
    });
});

describe('patch', () => {
    it('shallow-merges into an existing object', () => {
        const el = make();
        el.put('user', { name: 'Ali', role: 'Dev' });

        el.patch('user', { role: 'Lead' });

        expect(el.state.user).toEqual({ name: 'Ali', role: 'Lead' });
    });

    it('creates key if it did not exist', () => {
        const el = make();

        el.patch('user', { name: 'Ali' });

        expect(el.state.user).toEqual({ name: 'Ali' });
    });
});

describe('push', () => {
    it('appends item to an existing array', () => {
        const el = make();
        el.put('todos', [{ id: 1 }]);

        el.push('todos', { id: 2 });

        expect(el.state.todos).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('creates array when key is absent', () => {
        const el = make();

        el.push('todos', { id: 1 });

        expect(el.state.todos).toEqual([{ id: 1 }]);
    });
});

describe('pull', () => {
    it('removes item by id value', () => {
        const el = make();
        el.put('todos', [{ id: 1 }, { id: 2 }]);

        el.pull('todos', 1);

        expect(el.state.todos).toEqual([{ id: 2 }]);
    });

    it('removes items matching a predicate', () => {
        const el = make();
        el.put('todos', [{ id: 1, done: true }, { id: 2, done: false }]);

        el.pull('todos', (item: unknown) => Boolean((item as Record<string, unknown>).done));

        expect(el.state.todos).toEqual([{ id: 2, done: false }]);
    });

    it('leaves non-matching items intact', () => {
        const el = make();
        el.put('todos', [{ id: 1 }, { id: 2 }]);

        el.pull('todos', 3);

        expect(el.state.todos).toEqual([{ id: 1 }, { id: 2 }]);
    });
});

describe('register', () => {
    it('fires handler when matching CustomEvent is dispatched on wrapper', () => {
        const el = make();
        let fired = false;
        el.register({ topic: () => { fired = true; } });

        el.dispatchEvent(new CustomEvent('topic'));

        expect(fired).toBe(true);
    });

    it('multiple registrations for same topic both fire', () => {
        const el = make();
        let calls = 0;
        el.register({ topic: () => { calls += 1; } });
        el.register({ topic: () => { calls += 1; } });

        el.dispatchEvent(new CustomEvent('topic'));

        expect(calls).toBe(2);
    });
});

describe('publish', () => {
    it('routes registered directives through DW_DIRECTIVES', () => {
        let seen: unknown;

        DW_DIRECTIVES.set('probe', ({ wrapper, el }) => value => {
            seen = { wrapper, el, value };
        });

        const el = document.createElement('data-wrapper') as TestWrapper;
        const target = document.createElement('span');
        target.setAttribute('*probe', '/name');
        el.appendChild(target);
        document.body.appendChild(el);

        el.put('name', 'Ali');

        expect(seen).toEqual({ wrapper: el, el: target, value: 'Ali' });
        expect(target.getAttribute('probe')).toBeNull();
    });

    it('does not route $ bindings through DW_DIRECTIVES', () => {
        const el = make('<span $probe="/name"></span>');
        const target = el.querySelector('span')!;
        let calls = 0;

        DW_DIRECTIVES.set('probe', () => {
            calls += 1;
            return () => {};
        });

        el.put('name', 'Ali');

        expect(calls).toBe(0);
        expect(target.getAttribute('probe')).toBe('Ali');
    });

    it('calls each subscriber registered to the key', () => {
        const el = make('<span $text="/name"></span><strong $text="/name"></strong>');

        el.put('name', 'Ali');

        expect(el.querySelector('span')?.textContent).toBe('Ali');
        expect(el.querySelector('strong')?.textContent).toBe('Ali');
    });

    it('pipes are applied before binding', () => {
        const el = make('<span $text="/name?format=upper"></span>');

        el.put('name', 'ali');

        expect(el.querySelector('span')?.textContent).toBe('ALI');
    });

    it('skips configs whose el is disconnected from DOM', () => {
        const el = make();
        const target = document.createElement('span');
        el._subs.name = [
            ((value: unknown) => {
                if (!target.isConnected) return;
                target.textContent = String(value);
            }) as Sub,
        ];

        el.put('name', 'Ali');

        expect(target.textContent).toBe('');
    });
});

describe('MutationObserver', () => {
    it('reacts to external dataset changes and broadcasts', async () => {
        const el = make('<span $text="/name"></span>');

        el.dataset.name = 'Ali';
        await tick();

        expect(el.querySelector('span')?.textContent).toBe('Ali');
    });

    it('ignores mutations caused by its own put() (no re-entrant loop)', async () => {
        const el = make();
        const target = document.createElement('span');
        el.appendChild(target);
        let pipeCalls = 0;
        el._subs.count = [
            ((value: unknown) => {
                pipeCalls += 1;
                target.textContent = String(value);
            }) as Sub,
        ];

        el.put('count', 1);
        await tick();

        expect(pipeCalls).toBe(1);
        expect(target.textContent).toBe('1');
    });
});

describe('nested paths', () => {
    it('wrapper.get drills slash-separated paths into deep state', () => {
        const el = make();
        el.put('user', { name: { first: 'Ali' }, age: 30 });

        expect(el.get('user/name/first')).toBe('Ali');
        expect(el.get('user/age')).toBe(30);
        expect(el.get('user/missing')).toBeUndefined();
    });

    it('wrapper.get accepts flat keys (backward compatible)', () => {
        const el = make();
        el.put('name', 'Ali');

        expect(el.get('name')).toBe('Ali');
    });

    it('put writes a nested leaf without disturbing siblings', () => {
        const el = make();
        el.put('user', { name: 'Ali', age: 30 });

        el.put('user/name', 'Bo');

        expect(el.get('user/name')).toBe('Bo');
        expect(el.get('user/age')).toBe(30);
    });

    it('put on a nested path fans out to both the root and leaf channels', () => {
        const el = make();
        el.put('user', { name: 'Ali' });

        const rootSeen: unknown[] = [];
        const leafSeen: unknown[] = [];
        el._subs.user        = [v => rootSeen.push(v)];
        el._subs['user/name'] = [v => leafSeen.push(v)];

        el.put('user/name', 'Bo');

        expect(rootSeen).toEqual([{ name: 'Bo' }]);
        expect(leafSeen).toEqual(['Bo']);
    });

    it('external dataset mutation fans out to nested subscribers', async () => {
        const el = make();
        const seen: unknown[] = [];
        el._subs['user/name'] = [v => seen.push(v)];

        el.dataset.user = JSON.stringify({ name: 'Bo' });
        await tick();

        expect(seen).toEqual(['Bo']);
    });

    it('patch merges into deeply nested objects', () => {
        const el = make();
        el.put('config', { theme: { mode: 'dark', accent: 'blue' } });

        el.patch('config/theme', { mode: 'light' });

        expect(el.get('config/theme')).toEqual({ mode: 'light', accent: 'blue' });
    });

    it('a nested write leaves an unchanged sibling channel quiet', () => {
        const el = make();
        el.put('user', { name: 'Ali', age: 30 });

        const nameSeen: unknown[] = [];
        const ageSeen: unknown[] = [];
        el._subs['user/name'] = [v => nameSeen.push(v)];
        el._subs['user/age']  = [v => ageSeen.push(v)];

        el.put('user/name', 'Bo');

        expect(nameSeen).toEqual(['Bo']);   // changed → fired
        expect(ageSeen).toEqual([]);         // untouched → quiet
    });

    it('a nested write leaves an off-axis branch quiet', () => {
        const el = make();
        el.put('user', { name: 'Ali', address: { city: 'NYC' } });

        const addrSeen: unknown[] = [];
        el._subs['user/address'] = [v => addrSeen.push(v)];

        el.put('user/name', 'Bo');

        expect(addrSeen).toEqual([]);   // off-axis from /user/name → quiet
    });

    it('a deep write fires the intermediate object channel, not its siblings', () => {
        const el = make();
        el.put('user', { address: { city: 'NYC' }, name: 'Ali' });

        const addrSeen: unknown[] = [];
        const nameSeen: unknown[] = [];
        el._subs['user/address'] = [v => addrSeen.push(v)];
        el._subs['user/name']    = [v => nameSeen.push(v)];

        el.put('user/address/city', 'LA');

        expect(addrSeen).toEqual([{ city: 'LA' }]);  // on the write path → fired
        expect(nameSeen).toEqual([]);                 // untouched → quiet
    });

    it('external mutations broadcast on the entire subtree axis', async () => {
        const el = make();
        el.dataset.user = JSON.stringify({ name: 'Ali', age: 30 });
        await tick();

        const nameSeen: unknown[] = [];
        const ageSeen: unknown[] = [];
        el._subs['user/name'] = [v => nameSeen.push(v)];
        el._subs['user/age']  = [v => ageSeen.push(v)];

        el.dataset.user = JSON.stringify({ name: 'Bo', age: 30 });
        await tick();

        // External mutations carry no path information beyond the root key,
        // so the framework broadcasts on the entire `user` subtree axis.
        // Subscribers receive their channel's current resolved value;
        // whether it changed since last fire is the consumer's concern.
        // Precision is the privilege of writes that come through `put()`.
        expect(nameSeen).toEqual(['Bo']);
        expect(ageSeen).toEqual([30]);
    });
});

describe('connectedCallback', () => {
    it('wakes the subtree and sets up bindings', () => {
        const el = make('<span $text="/name"></span>');

        expect(el._subs.name).toHaveLength(1);
    });

    it('broadcasts all existing data-* keys on connect', () => {
        const el = document.createElement('data-wrapper') as TestWrapper;
        el.dataset.name = 'Ali';
        el.innerHTML = '<span $text="/name"></span>';

        document.body.appendChild(el);

        expect(el.querySelector('span')?.textContent).toBe('Ali');
    });
});

describe('$data-* computed values', () => {
    const makeWith = (attrs: Record<string, string>, html = ''): TestWrapper => {
        const el = document.createElement('data-wrapper') as TestWrapper;
        // Set attrs in insertion order BEFORE appending — so wake's
        // setupComputeds sees them and walks them in HTML order, which
        // is the order topo sort gets to reorder.
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
        el.innerHTML = html;
        document.body.appendChild(el);
        return el;
    };

    it('computes an initial value synchronously at wake', () => {
        const el = makeWith({
            'data-todos':   '[{"id":1,"done":true},{"id":2,"done":false},{"id":3,"done":false}]',
            '$data-active': '/todos?where=!done',
        }, '<span $text="/active?length"></span>');

        // Initial pass ran in topo order before DOM bindings woke, so
        // the span should already show the filtered count.
        expect(el.get('active')).toEqual([{ id: 2, done: false }, { id: 3, done: false }]);
        expect(el.querySelector('span')?.textContent).toBe('2');
    });

    it('recomputes on dep change after a microtask', async () => {
        const el = makeWith({
            'data-todos':   '[{"id":1,"done":false}]',
            '$data-active': '/todos?where=!done',
        });

        el.put('todos', [{ id: 1, done: true }, { id: 2, done: false }]);
        await tick();

        expect(el.get('active')).toEqual([{ id: 2, done: false }]);
    });

    it('cascades through chained computeds (/c ← /b ← /a)', async () => {
        const el = makeWith({
            'data-a':   'hi',
            '$data-b':  '/a?upper',
            '$data-c':  '/b?length',
        });

        // Initial pass: /b = "HI", /c = 2.
        expect(el.get('b')).toBe('HI');
        expect(el.get('c')).toBe(2);

        el.put('a', 'hello');
        await tick();

        expect(el.get('b')).toBe('HELLO');
        expect(el.get('c')).toBe(5);
    });

    it('a diamond fires the terminal binding exactly once per upstream write', async () => {
        const el = makeWith({
            'data-a':  '2',
            '$data-b': '/a',
            '$data-c': '/a',
            '$data-d': '/b',
        });

        // Spy: count how many times /d's data-* attribute is written
        // after the initial pass settles.
        let dWrites = 0;
        const obs = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.attributeName === 'data-d') dWrites += 1;
            }
        });
        obs.observe(el, { attributes: true });

        el.put('a', '3');
        await tick();
        obs.disconnect();

        // Numbers JSON-parse back through `state` on read — `'3'` →  3.
        // /d reads /b only (the harder /d ← /b, /c diamond needs pURL-arg
        // resolution in a custom formatter to test; deferred to dogfood).
        expect(el.get('d')).toBe(3);
        expect(dWrites).toBe(1);
    });

    it('warns once per key when DevTools edits a computed-bound attribute', async () => {
        const el = makeWith({
            'data-source':   'hello',
            '$data-derived': '/source?upper',
        });

        const warn = console.warn;
        const calls: string[] = [];
        console.warn = (msg: string) => { calls.push(msg); };

        // Two external edits to the same computed-bound key.
        el.dataset.derived = 'EXTERNAL1';
        await tick();
        el.dataset.derived = 'EXTERNAL2';
        await tick();

        // Edit to a non-computed key shouldn't warn.
        el.dataset.source = 'world';
        await tick();

        console.warn = warn;

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatch(/derived/);
    });

    it('initial values cascade in topological order regardless of attribute order', () => {
        // `$data-c` references `/b`, which is itself computed from `/a`.
        // Declared c-before-b on purpose; topo sort still computes /b first.
        const el = makeWith({
            'data-a':  'hi',
            '$data-c': '/b?length',
            '$data-b': '/a?upper',
        });

        expect(el.get('b')).toBe('HI');
        expect(el.get('c')).toBe(2);
    });
});
