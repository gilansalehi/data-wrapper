import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { q, emit, on } from '@lib/utils.ts';

describe('q', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('returns an array of all matching elements', () => {
        document.body.innerHTML = '<div class="foo"></div><div class="foo"></div>';
        const result = q('.foo');
        expect(result).toHaveLength(2);
        expect(Array.isArray(result)).toBe(true);
    });

    it('returns an empty array when nothing matches', () => {
        const result = q('.nonexistent');
        expect(result).toEqual([]);
    });

    it('accepts a context element as second argument', () => {
        document.body.innerHTML = '<div id="scope"><span class="inner"></span></div><span class="outer"></span>';
        const scope = document.getElementById('scope') as Element;
        const result = q('span', scope);
        expect(result).toHaveLength(1);
        expect(result[0].className).toBe('inner');
    });

    it('searches inside DocumentFragment', () => {
        const frag = document.createDocumentFragment();
        const span = document.createElement('span');
        frag.appendChild(span);
        const result = q('span', frag);
        expect(result).toHaveLength(1);
    });
});

describe('emit', () => {
    it('dispatches a CustomEvent with the given name', () => {
        let received: Event | CustomEvent | null = null;
        document.addEventListener('emit:name-check', e => { received = e; }, { once: true });
        emit('emit:name-check');
        expect(received).not.toBeNull();
        const event = received as Event | null;
        expect(event?.type).toBe('emit:name-check');
    });

    it('puts payload in event.detail', () => {
        let detail: unknown;
        document.addEventListener('emit:detail-check', e => { detail = (e as CustomEvent).detail; }, { once: true });
        emit('emit:detail-check', { x: 42 });
        expect(detail).toEqual({ x: 42 });
    });

    it('bubbles by default', () => {
        document.body.innerHTML = '<div id="bubble-source"></div>';
        const inner = document.getElementById('bubble-source') as Element;
        let bubbled = false;
        document.addEventListener('emit:bubble-check', () => { bubbled = true; }, { once: true });
        emit('emit:bubble-check', undefined, inner);
        expect(bubbled).toBe(true);
    });

    it('defaults to document when no ctx given', () => {
        let fired = false;
        document.addEventListener('emit:default-ctx', () => { fired = true; }, { once: true });
        emit('emit:default-ctx');
        expect(fired).toBe(true);
    });

    it.todo('dispatches on the provided element ctx');
});

describe('on', () => {
    it.todo('calls callback when the event fires');
    it.todo('returns an unsubscribe function that stops the listener');
    it.todo('with delegate selector: fires only when a matching child is the target');
    it.todo('with delegate selector: sets e.delegateTarget to the matching element');
    it.todo('with delegate selector: does not fire when no matching ancestor');
});
