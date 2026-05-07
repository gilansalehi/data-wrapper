import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { q, qcb, emit, on } from '@lib/utils.ts';

describe('q', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it.todo('returns an array of all matching elements');
    it.todo('returns an empty array when nothing matches');
    it.todo('accepts a context element as second argument');
    it.todo('searches inside DocumentFragment');
});

describe('qcb', () => {
    it.todo('maps over matched elements and returns results');
    it.todo('returns empty array when nothing matches');
});

describe('emit', () => {
    it.todo('dispatches a CustomEvent with the given name');
    it.todo('puts payload in event.detail');
    it.todo('bubbles by default');
    it.todo('defaults to document when no ctx given');
    it.todo('dispatches on the provided element ctx');
});

describe('on', () => {
    it.todo('calls callback when the event fires');
    it.todo('returns an unsubscribe function that stops the listener');
    it.todo('with delegate selector: fires only when a matching child is the target');
    it.todo('with delegate selector: sets e.delegateTarget to the matching element');
    it.todo('with delegate selector: does not fire when no matching ancestor');
});
