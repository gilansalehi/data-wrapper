import { describe, it, expect } from '@tests/helpers.ts';
import { VP_FORMATTERS, CONFIG, sync, PROP_ALIASES } from '@lib/registry.ts';

describe('CONFIG', () => {
    it('defaults to $ / _ / @ tokens', () => {
        expect(CONFIG.TOKENS).toEqual({ BIND: '$', ADD: '_', EVT: '@' });
    });

    it('merges window.VP_CUSTOM_CONFIG.TOKENS when present', async () => {
        const original = window.VP_CUSTOM_CONFIG;
        window.VP_CUSTOM_CONFIG = { TOKENS: { BIND: ':', ADD: '+', EVT: '#' } };

        const mod = await import(`../../src/lib/registry.ts?custom=${Date.now()}`) as typeof import('@lib/registry.ts');

        expect(mod.CONFIG.TOKENS).toEqual({ BIND: ':', ADD: '+', EVT: '#' });
        if (original) window.VP_CUSTOM_CONFIG = original;
        else delete window.VP_CUSTOM_CONFIG;
    });

    it('NO_WAKE includes DATA-WRAPPER and TEMPLATE', () => {
        expect(CONFIG.NO_WAKE).toContain('DATA-WRAPPER');
        expect(CONFIG.NO_WAKE).toContain('TEMPLATE');
    });
});

describe('PROP_ALIASES', () => {
    it('maps text  → textContent', () => {
        expect(PROP_ALIASES.text).toBe('textContent');
    });

    it('maps html  → innerHTML', () => {
        expect(PROP_ALIASES.html).toBe('innerHTML');
    });

    it('maps class → className', () => {
        expect(PROP_ALIASES.class).toBe('className');
    });

    it('maps for   → htmlFor', () => {
        expect(PROP_ALIASES.for).toBe('htmlFor');
    });
});

describe('sync', () => {
    it('sets el[prop] = val directly', () => {
        const input = document.createElement('input');

        sync(input, 'value', 'draft');

        expect(input.value).toBe('draft');
    });

    it('resolves PROP_ALIASES before setting', () => {
        const span = document.createElement('span');

        sync(span, 'text', 'Hello');

        expect(span.textContent).toBe('Hello');
    });

    it('handles camelCase props (tabIndex, readOnly)', () => {
        const input = document.createElement('input');

        sync(input, 'tabindex', 3);
        sync(input, 'readonly', true);

        expect(input.tabIndex).toBe(3);
        expect(input.readOnly).toBe(true);
    });
});

describe('VP_FORMATTERS — built-ins', () => {
    const fmt = (name: string) => VP_FORMATTERS.get(name)!;

    it('count: returns array.length', () => {
        expect(fmt('count')([1, 2, 3])).toBe(3);
    });

    it('count: returns 0 for non-array', () => {
        expect(fmt('count')({ length: 3 })).toBe(0);
    });

    it('currency: formats number as $0.00', () => {
        expect(fmt('currency')(9.5)).toBe('$9.50');
    });

    it('upper: uppercases string', () => {
        expect(fmt('upper')('hello')).toBe('HELLO');
    });

    it('lower: lowercases string', () => {
        expect(fmt('lower')('HELLO')).toBe('hello');
    });

    it('trim: trims whitespace', () => {
        expect(fmt('trim')('  hello  ')).toBe('hello');
    });

    it('bool: returns boolean truthiness', () => {
        expect(fmt('bool')('value')).toBe(true);
        expect(fmt('bool')('')).toBe(false);
    });

    it('yesno: returns "yes"/"no"', () => {
        expect(fmt('yesno')(true)).toBe('yes');
        expect(fmt('yesno')(false)).toBe('no');
    });

    it('onoff: returns "on"/"off"', () => {
        expect(fmt('onoff')(true)).toBe('on');
        expect(fmt('onoff')(false)).toBe('off');
    });

    it('date: formats ISO date string', () => {
        expect(fmt('date')('2024-06-15')).toMatch(/6\/15\/2024|15\/06\/2024|2024/);
    });

    it('json: JSON.stringify with indent', () => {
        expect(fmt('json')({ x: 42 })).toBe('{\n  "x": 42\n}');
    });

    it('fallback: returns "—" for falsy values', () => {
        expect(fmt('fallback')(null)).toBe('—');
        expect(fmt('fallback')(undefined)).toBe('—');
    });

    it('fallback: passes through truthy values', () => {
        expect(fmt('fallback')('value')).toBe('value');
    });
});
