import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
// DataWrapper is registered as a side-effect of the import
import '@lib/component.ts';

const make = (html = ''): HTMLElement & Record<string, unknown> => {
    const el = document.createElement('data-wrapper') as HTMLElement & Record<string, unknown>;
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
};

describe('state proxy', () => {
    it.todo('reads dataset string as-is');
    it.todo('parses JSON values (numbers, objects, arrays)');
    it.todo('serialises objects to JSON on write');
    it.todo('serialises primitives to string on write');
    it.todo('returns undefined for missing keys');
});

describe('put', () => {
    it.todo('sets state key and updates data-* attribute');
    it.todo('accepts an updater function (prev => next)');
    it.todo('skips broadcast when value is identical');
    it.todo('emits data:sync event with the changed key');
});

describe('patch', () => {
    it.todo('shallow-merges into an existing object');
    it.todo('creates key if it did not exist');
});

describe('push', () => {
    it.todo('appends item to an existing array');
    it.todo('creates array when key is absent');
});

describe('pull', () => {
    it.todo('removes item by id value');
    it.todo('removes items matching a predicate');
    it.todo('leaves non-matching items intact');
});

describe('register', () => {
    it.todo('fires handler when matching CustomEvent is dispatched on wrapper');
    it.todo('multiple registrations for same topic both fire');
});

describe('_broadcast', () => {
    it.todo('calls applyBinding for each config subscribed to the key');
    it.todo('pipes are applied before binding');
    it.todo('skips configs whose el is disconnected from DOM');
});

describe('MutationObserver', () => {
    it.todo('reacts to external dataset changes and broadcasts');
    it.todo('ignores mutations caused by its own put() (no re-entrant loop)');
});

describe('connectedCallback', () => {
    it.todo('wakes the subtree and sets up bindings');
    it.todo('broadcasts all existing data-* keys on connect');
});
