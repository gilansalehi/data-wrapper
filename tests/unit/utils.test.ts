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

    it('can dispatch without bubbling', () => {
        document.body.innerHTML = '<div id="bubble-source"></div>';
        const inner = document.getElementById('bubble-source') as Element;
        let bubbled = false;
        document.addEventListener('emit:no-bubble-check', () => { bubbled = true; }, { once: true });
        emit('emit:no-bubble-check', undefined, inner, { bubbles: false });
        expect(bubbled).toBe(false);
    });

    it('defaults to document when no ctx given', () => {
        let fired = false;
        document.addEventListener('emit:default-ctx', () => { fired = true; }, { once: true });
        emit('emit:default-ctx');
        expect(fired).toBe(true);
    });

    it('dispatches on the provided element ctx', () => {
        const el = document.createElement('div');
        let fired = false;
        el.addEventListener('emit:ctx-check', () => { fired = true; });

        emit('emit:ctx-check', undefined, el);

        expect(fired).toBe(true);
    });
});

describe('on', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('calls callback when the event fires', () => {
        let calls = 0;
        on('utils:plain', () => { calls += 1; });

        document.dispatchEvent(new Event('utils:plain'));

        expect(calls).toBe(1);
    });

    it('returns an unsubscribe function that stops the listener', () => {
        let calls = 0;
        const off = on('utils:unsubscribe', () => { calls += 1; });

        off();
        document.dispatchEvent(new Event('utils:unsubscribe'));

        expect(calls).toBe(0);
    });

    it('with delegate selector: fires only when a matching child is the target', () => {
        document.body.innerHTML = '<button class="match"></button><button class="miss"></button>';
        let calls = 0;
        on('click', () => { calls += 1; }, '.match', document.body);

        document.querySelector('.match')!.dispatchEvent(new Event('click', { bubbles: true }));
        document.querySelector('.miss')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(1);
    });

    it('with delegate selector: sets e.delegateTarget to the matching element', () => {
        document.body.innerHTML = '<button class="match"><span>Label</span></button>';
        let delegate: Element | null | undefined;
        on('click', e => {
            delegate = (e as Event & { delegateTarget?: Element | null }).delegateTarget;
        }, '.match', document.body);

        document.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(delegate).toBe(document.querySelector('.match'));
    });

    it('with delegate selector: does not fire when no matching ancestor', () => {
        document.body.innerHTML = '<button class="miss"></button>';
        let calls = 0;
        on('click', () => { calls += 1; }, '.match', document.body);

        document.querySelector('.miss')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(0);
    });
});
