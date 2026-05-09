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

beforeEach(() => {
    document.body.innerHTML = '';
    DW_DIRECTIVES.delete('probe');
});

describe('framework types', () => {
    it('Sub and Subs model subscriber buckets', () => {
        const subs: Subs<number> = [];
        const sub: Sub<number> = value => { document.body.dataset.value = String(value); };

        subs.push(sub);
        subs[0](7);

        expect(document.body.dataset.value).toBe('7');
    });

    it('Row carries node, item, and row subscriptions', () => {
        const row: Row = {
            node: document.createElement('li'),
            item: { id: 1 } satisfies Item,
            subs: [],
        };

        expect(row.node.tagName).toBe('LI');
        expect(row.item.id).toBe(1);
        expect(row.subs).toEqual([]);
    });

    it('DirectiveContext receives the shared wrapper shape', () => {
        const wrapper = document.createElement('data-wrapper') as Wrapper;
        wrapper.state = {};
        wrapper._subs = {};
        wrapper._boundEvents = new Set();
        wrapper._listCache = new Map();
        wrapper._watch = () => {};
        wrapper._routeEvent = () => {};

        const ctx: DirectiveContext = {
            wrapper,
            el: document.createElement('div'),
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
        wrapper._boundEvents = new Set();
        wrapper._listCache = new Map();
        wrapper._watch = () => {};
        wrapper._routeEvent = () => {};

        DW_DIRECTIVES.set('probe', () => value => { document.body.dataset.value = String(value); });
        DW_DIRECTIVES.get('probe')!({
            wrapper,
            el: document.createElement('span'),
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
});
