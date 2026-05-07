import { describe, it, expect } from '@tests/helpers.ts';
import { VP_FORMATTERS, CONFIG, sync, PROP_ALIASES } from '@lib/registry.ts';

describe('CONFIG', () => {
    it.todo('defaults to $ / _ / @ tokens');
    it.todo('merges window.VP_CUSTOM_CONFIG.TOKENS when present');
    it.todo('NO_WAKE includes DATA-WRAPPER and TEMPLATE');
});

describe('PROP_ALIASES', () => {
    it.todo('maps text  → textContent');
    it.todo('maps html  → innerHTML');
    it.todo('maps class → className');
    it.todo('maps for   → htmlFor');
});

describe('sync', () => {
    it.todo('sets el[prop] = val directly');
    it.todo('resolves PROP_ALIASES before setting');
    it.todo('handles camelCase props (tabIndex, readOnly)');
});

describe('VP_FORMATTERS — built-ins', () => {
    const fmt = (name: string) => VP_FORMATTERS.get(name)!;

    it.todo('count: returns array.length');
    it.todo('count: returns 0 for non-array');
    it.todo('currency: formats number as $0.00');
    it.todo('upper: uppercases string');
    it.todo('lower: lowercases string');
    it.todo('trim: trims whitespace');
    it.todo('bool: returns "true"/"false" string');
    it.todo('yesno: returns "yes"/"no"');
    it.todo('onoff: returns "on"/"off"');
    it.todo('date: formats ISO date string');
    it.todo('json: JSON.stringify with indent');
    it.todo('fallback: returns "—" for falsy values');
    it.todo('fallback: passes through truthy values');
});
