import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import {
    cloneTemplate,
    DW_DIRECTIVES,
    DW_FORMATTERS,
    DW_TEMPLATES,
    PROP_ALIASES,
    resolveTemplate,
} from '@lib/registry.ts';
import type { DirectiveContext, Item, Row, Sub, Subs, Wrapper } from '@lib/registry.ts';
import { p } from '@lib/utils.ts';

beforeEach(() => {
    document.body.innerHTML = '';
    DW_DIRECTIVES.delete('probe');
});

describe('framework types', () => {
    it('Sub and Subs model subscriber buckets', () => {
        const subs: Subs = [];
        const sub: Sub = value => { document.body.dataset.value = String(value); };

        subs.push(sub);
        subs[0](7);

        expect(document.body.dataset.value).toBe('7');
    });

    it('Row carries node, item, a Station of subs, and escape Offs', () => {
        const row: Row = {
            node: document.createElement('li'),
            item: { id: 1 } satisfies Item,
            subs: {},
            unsubs: [],
        };

        expect(row.node.tagName).toBe('LI');
        expect(row.item.id).toBe(1);
        expect(row.subs).toEqual({});
        expect(row.unsubs).toEqual([]);
    });

    it('DirectiveContext receives the shared wrapper shape', () => {
        const wrapper = document.createElement('data-wrapper') as Wrapper;
        wrapper.state = {};
        wrapper._subs = {};
        wrapper._listCache = new Map();

        const ctx: DirectiveContext = {
            wrapper,
            el: document.createElement('div'),
            ...p('/count'),
            wake: () => {},
        };

        expect(ctx.wrapper).toBe(wrapper);
    });
});

describe('templates', () => {
    it('resolveTemplate returns built-in templates', () => {
        expect(resolveTemplate('dw-empty').content.textContent).toBe('No items');
    });

    it('page-declared templates override registered templates', () => {
        const registered = document.createElement('template');
        registered.innerHTML = '<span>Registered</span>';
        DW_TEMPLATES.set('custom-empty', registered);

        const declared = document.createElement('template');
        declared.id = 'custom-empty';
        declared.innerHTML = '<span>Declared</span>';
        document.body.appendChild(declared);

        expect(resolveTemplate('custom-empty')).toBe(declared);
        DW_TEMPLATES.delete('custom-empty');
    });

    it('unknown templates fall back to dw-missing', () => {
        expect(resolveTemplate('missing-template').content.textContent).toBe('—');
    });

    it('cloneTemplate returns the first element from a template clone', () => {
        const tpl = document.createElement('template');
        tpl.innerHTML = '<li>One</li><li>Two</li>';

        const node = cloneTemplate(tpl);

        expect(node?.tagName).toBe('LI');
        expect(node?.textContent).toBe('One');
    });
});

describe('PROP_ALIASES', () => {
    it('maps html-facing names to DOM property names', () => {
        expect(PROP_ALIASES.text).toBe('textContent');
        expect(PROP_ALIASES.html).toBe('innerHTML');
        expect(PROP_ALIASES.class).toBe('className');
        expect(PROP_ALIASES.for).toBe('htmlFor');
    });
});

describe('DW_DIRECTIVES', () => {
    it('stores directive factories that return subscribers', () => {
        const wrapper = document.createElement('data-wrapper') as Wrapper;
        wrapper.state = {};
        wrapper._subs = {};
        wrapper._listCache = new Map();

        DW_DIRECTIVES.set('probe', () => value => { document.body.dataset.value = String(value); });
        DW_DIRECTIVES.get('probe')!({
            wrapper,
            el: document.createElement('span'),
            ...p('/probe'),
            wake: () => {},
        })('Ali');

        expect(document.body.dataset.value).toBe('Ali');
    });
});

describe('DW_FORMATTERS built-ins', () => {
    const fmt = (name: string) => DW_FORMATTERS.get(name)!;

    it('count returns lengths for arrays and strings', () => {
        expect(fmt('count')([1, 2, 3])).toBe(3);
        expect(fmt('count')('abc')).toBe(3);
        expect(fmt('count')({ length: 3 })).toBe(0);
    });

    it('formats strings', () => {
        expect(fmt('upper')('hello')).toBe('HELLO');
        expect(fmt('lower')('HELLO')).toBe('hello');
        expect(fmt('trim')('  hello  ')).toBe('hello');
    });

    it('formats booleans', () => {
        expect(fmt('bool')('value')).toBe(true);
        expect(fmt('bool')('')).toBe(false);
        expect(fmt('yesno')(true)).toBe('yes');
        expect(fmt('yesno')(false)).toBe('no');
        expect(fmt('onoff')(true)).toBe('on');
        expect(fmt('onoff')(false)).toBe('off');
    });

    it('formats currency, dates, json, and fallback values', () => {
        expect(fmt('currency')(9.5)).toBe('$9.50');
        expect(fmt('date')('2024-06-15')).toMatch(/6\/15\/2024|15\/06\/2024|2024/);
        expect(fmt('json')({ x: 42 })).toBe('{\n  "x": 42\n}');
        expect(fmt('fallback')(null)).toBe('—');
        expect(fmt('fallback')(undefined)).toBe('—');
        expect(fmt('fallback')('value')).toBe('value');
    });

    it('where filters arrays by a single-clause predicate', () => {
        const items = [
            { id: 1, done: true,  task: 'a' },
            { id: 2, done: false, task: 'b' },
            { id: 3, done: false, task: 'c' },
        ];
        // truthy field
        expect(fmt('where')(items, 'done')).toEqual([items[0]]);
        // falsy field (`!` prefix)
        expect(fmt('where')(items, '!done')).toEqual([items[1], items[2]]);
        // equality, JSON-parsed value (boolean compare, not string)
        expect(fmt('where')(items, 'done=true')).toEqual([items[0]]);
        // equality, string fallback when not JSON
        expect(fmt('where')(items, 'task=b')).toEqual([items[1]]);
    });

    it('where with no arg or non-array value returns input unchanged', () => {
        const items = [{ id: 1 }];
        expect(fmt('where')(items, '')).toBe(items);
        expect(fmt('where')(items, undefined)).toBe(items);
        expect(fmt('where')(42, 'done')).toBe(42);
    });

    it('get drills a slash-separated path into the current value', () => {
        const value = { user: { name: { first: 'Ali' } } };
        expect(fmt('get')(value, 'user/name/first')).toBe('Ali');
        expect(fmt('get')([10, 20, 30], '1')).toBe(20);
    });

    it('get with no arg returns the input unchanged', () => {
        const value = { x: 1 };
        expect(fmt('get')(value, '')).toBe(value);
        expect(fmt('get')(value, undefined)).toBe(value);
    });

    it('length returns size for arrays and strings, 0 otherwise', () => {
        expect(fmt('length')([1, 2, 3])).toBe(3);
        expect(fmt('length')('hello')).toBe(5);
        expect(fmt('length')({ length: 99 })).toBe(0);
        expect(fmt('length')(null)).toBe(0);
    });
});
