import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { CONFIG, DW_DIRECTIVES } from '@lib/registry.ts';
import type { UpdateConfig } from '@lib/engine.ts';
// DataWrapper is registered as a side-effect of the import
import '@lib/component.ts';

interface TestWrapper extends HTMLElement {
    state: Record<string, unknown>;
    _subs: Record<string, UpdateConfig[]>;
    _broadcast(key: string, val: unknown): void;
    register(actions: Record<string, EventListener>): void;
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

const DEFAULT_TOKENS = { BIND: '$', DIR: '*', EVT: '@' } as const;

const resetTestConfig = () => {
    CONFIG.TOKENS = { ...DEFAULT_TOKENS };
};

const setDirectiveToken = (token: string) => {
    CONFIG.TOKENS = { ...DEFAULT_TOKENS, DIR: token };
};

beforeEach(() => {
    document.body.innerHTML = '';
    resetTestConfig();
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
        el.dataset.count = '1';
        let broadcasts = 0;
        el._broadcast = () => { broadcasts += 1; };

        el.put('count', 1);

        expect(broadcasts).toBe(0);
    });

    it('emits data:sync event with the changed key', () => {
        const el = make();
        let key: unknown;
        el.addEventListener('data:sync', e => { key = (e as CustomEvent).detail.key; });

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

describe('_broadcast', () => {
    it('routes registered directives through DW_DIRECTIVES', () => {
        setDirectiveToken(':');
        const original = DW_DIRECTIVES.get('probe');
        const el = make('<span :probe="/name"></span>');
        const target = el.querySelector('span')!;
        let seen: unknown;

        DW_DIRECTIVES.set('probe', ({ wrapper, config, value }) => {
            seen = { wrapper, el: config.el, value };
        });

        try {
            el.put('name', 'Ali');

            expect(seen).toEqual({ wrapper: el, el: target, value: 'Ali' });
            expect(target.getAttribute('probe')).toBeNull();
        } finally {
            if (original) DW_DIRECTIVES.set('probe', original);
            else DW_DIRECTIVES.delete('probe');
        }
    });

    it('does not route $ bindings through DW_DIRECTIVES', () => {
        const original = DW_DIRECTIVES.get('probe');
        const el = make('<span $probe="/name"></span>');
        const target = el.querySelector('span')!;
        let calls = 0;

        DW_DIRECTIVES.set('probe', () => { calls += 1; });

        try {
            el.put('name', 'Ali');

            expect(calls).toBe(0);
            expect(target.getAttribute('probe')).toBe('Ali');
        } finally {
            if (original) DW_DIRECTIVES.set('probe', original);
            else DW_DIRECTIVES.delete('probe');
        }
    });

    it('calls applyBinding for each config subscribed to the key', () => {
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
        el._subs.name = [{ el: target, path: 'name', prop: 'textContent', pipes: [], itemNode: null }];

        el._broadcast('name', 'Ali');

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
        el._subs.count = [{
            el: target,
            path: 'count',
            prop: 'textContent',
            pipes: [v => { pipeCalls += 1; return v; }],
            itemNode: null,
        }];

        el.put('count', 1);
        await tick();

        expect(pipeCalls).toBe(1);
        expect(target.textContent).toBe('1');
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
