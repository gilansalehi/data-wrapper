import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { q, emit, on, readPath, writePath } from '@lib/utils.ts';

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

    // #region basics
    it('calls callback when the event fires', () => {
        let calls = 0;
        on('utils/plain', () => { calls += 1; });

        document.dispatchEvent(new Event('utils/plain'));

        expect(calls).toBe(1);
    });

    it('returns an unsubscribe function that stops the listener', () => {
        let calls = 0;
        const off = on('utils/unsubscribe', () => { calls += 1; });

        off();
        document.dispatchEvent(new Event('utils/unsubscribe'));

        expect(calls).toBe(0);
    });

    it('with no delegate: does not set actionTarget on the event', () => {
        let actionTarget: Element | undefined;
        on('utils/no-delegate', (e) => { actionTarget = e.actionTarget; });

        document.dispatchEvent(new Event('utils/no-delegate'));

        expect(actionTarget).toBeUndefined();
    });

    it('with empty string delegate: behaves like no delegate', () => {
        let calls = 0;
        on('utils/empty-delegate', () => { calls += 1; }, '');

        document.dispatchEvent(new Event('utils/empty-delegate'));

        expect(calls).toBe(1);
    });
    // #endregion

    // #region selector delegate
    it('with selector delegate: fires only when a matching ancestor exists', () => {
        document.body.innerHTML = '<button class="match"></button><button class="miss"></button>';
        let calls = 0;
        on('click', () => { calls += 1; }, '.match', document.body);

        document.querySelector('.match')!.dispatchEvent(new Event('click', { bubbles: true }));
        document.querySelector('.miss')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(1);
    });

    it('with selector delegate: sets e.actionTarget to the matched element', () => {
        document.body.innerHTML = '<button class="match"><span>Label</span></button>';
        let actionTarget: Element | undefined;
        on('click', (e) => { actionTarget = e.actionTarget; }, '.match', document.body);

        document.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(actionTarget).toBe(document.querySelector('.match')!);
    });

    it('with selector delegate: does not fire when no matching ancestor', () => {
        document.body.innerHTML = '<button class="miss"></button>';
        let calls = 0;
        on('click', () => { calls += 1; }, '.match', document.body);

        document.querySelector('.miss')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(0);
    });

    it('with selector delegate matching nothing in ctx: never fires', () => {
        document.body.innerHTML = '<button class="present"></button>';
        let calls = 0;
        on('click', () => { calls += 1; }, '.absent', document.body);

        document.querySelector('.present')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(0);
    });
    // #endregion

    // #region element delegate
    it('with Element delegate: fires when click is on the element itself', () => {
        document.body.innerHTML = '<button id="A"></button>';
        const a = document.getElementById('A') as Element;
        let calls = 0;
        on('click', () => { calls += 1; }, a, document.body);

        a.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(1);
    });

    it('with Element delegate: fires when click is on a descendant', () => {
        document.body.innerHTML = '<button id="A"><span>x</span></button>';
        const a = document.getElementById('A') as Element;
        let calls = 0;
        on('click', () => { calls += 1; }, a, document.body);

        document.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(1);
    });

    it('with Element delegate: does not fire for clicks outside its subtree', () => {
        document.body.innerHTML = '<button id="A"></button><button id="B"></button>';
        const a = document.getElementById('A') as Element;
        const b = document.getElementById('B') as Element;
        let calls = 0;
        on('click', () => { calls += 1; }, a, document.body);

        b.dispatchEvent(new Event('click', { bubbles: true }));

        expect(calls).toBe(0);
    });

    it('with Element delegate: sets e.actionTarget to the delegate', () => {
        document.body.innerHTML = '<button id="A"><span>x</span></button>';
        const a = document.getElementById('A') as Element;
        let actionTarget: Element | undefined;
        on('click', (e) => { actionTarget = e.actionTarget; }, a, document.body);

        document.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(actionTarget).toBe(a);
    });
    // #endregion

    // #region cross-firing — the core dedup contract
    it('two Element-delegated listeners on the same event type do not cross-fire', () => {
        document.body.innerHTML = '<button id="A"></button><button id="B"></button>';
        const a = document.getElementById('A') as Element;
        const b = document.getElementById('B') as Element;
        let aCalls = 0;
        let bCalls = 0;
        on('click', () => { aCalls += 1; }, a, document.body);
        on('click', () => { bCalls += 1; }, b, document.body);

        a.dispatchEvent(new Event('click', { bubbles: true }));

        expect(aCalls).toBe(1);
        expect(bCalls).toBe(0);
    });

    it('two selector-delegated listeners on the same event type do not cross-fire', () => {
        document.body.innerHTML = '<button class="alpha"></button><button class="beta"></button>';
        let alphaCalls = 0;
        let betaCalls = 0;
        on('click', () => { alphaCalls += 1; }, '.alpha', document.body);
        on('click', () => { betaCalls += 1; }, '.beta', document.body);

        document.querySelector('.alpha')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(alphaCalls).toBe(1);
        expect(betaCalls).toBe(0);
    });

    it('two listeners with identical delegate values fire once each on their own element', () => {
        document.body.innerHTML = '<button id="A"></button><button id="B"></button>';
        const a = document.getElementById('A') as Element;
        const b = document.getElementById('B') as Element;
        let aCalls = 0;
        let bCalls = 0;
        on('click', () => { aCalls += 1; }, a, document.body);
        on('click', () => { bCalls += 1; }, b, document.body);

        a.dispatchEvent(new Event('click', { bubbles: true }));
        b.dispatchEvent(new Event('click', { bubbles: true }));

        expect(aCalls).toBe(1);
        expect(bCalls).toBe(1);
    });
    // #endregion
});

describe('readPath', () => {
    it('returns the object itself for an empty path', () => {
        const obj = { a: 1 };
        expect(readPath(obj, '')).toBe(obj);
    });

    it('reads a single-segment path like a flat key', () => {
        expect(readPath({ name: 'Ali' }, 'name')).toBe('Ali');
    });

    it('drills through nested objects', () => {
        expect(readPath({ user: { name: { first: 'Ali' } } }, 'user/name/first')).toBe('Ali');
    });

    it('reads array indices via numeric segments', () => {
        expect(readPath({ items: [{ id: 1 }, { id: 2 }] }, 'items/1/id')).toBe(2);
    });

    it('returns undefined for missing branches without throwing', () => {
        expect(readPath({ user: { name: 'Ali' } }, 'user/age')).toBeUndefined();
        expect(readPath({ user: null }, 'user/name')).toBeUndefined();
        expect(readPath(undefined, 'user/name')).toBeUndefined();
    });
});

describe('writePath', () => {
    it('writes a single-segment path like a flat key', () => {
        const obj: Record<string, unknown> = {};
        writePath(obj, 'name', 'Ali');
        expect(obj.name).toBe('Ali');
    });

    it('creates intermediate objects when branches are missing', () => {
        const obj: Record<string, unknown> = {};
        writePath(obj, 'user/name/first', 'Ali');
        expect(obj).toEqual({ user: { name: { first: 'Ali' } } });
    });

    it('rebuilds the root key with an immutable spread', () => {
        const prevUser = { name: 'Ali', age: 30 };
        const obj: Record<string, unknown> = { user: prevUser };

        writePath(obj, 'user/name', 'Bo');

        expect(obj.user).not.toBe(prevUser);                       // new reference
        expect(obj.user).toEqual({ name: 'Bo', age: 30 });         // preserved siblings
        expect(prevUser).toEqual({ name: 'Ali', age: 30 });        // original untouched
    });

    it('preserves array type when drilling through arrays', () => {
        const obj: Record<string, unknown> = { items: [{ name: 'a' }, { name: 'b' }] };

        writePath(obj, 'items/1/name', 'updated');

        expect(Array.isArray(obj.items)).toBe(true);
        expect(obj.items).toEqual([{ name: 'a' }, { name: 'updated' }]);
    });
});
