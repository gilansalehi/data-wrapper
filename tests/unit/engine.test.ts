import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { bind, publish, reconcile, subscribe, unsubscribe, unwire, unwake } from '@lib/engine.ts';
import type { Row, Station, Wrapper } from '@lib/engine.ts';

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('bind', () => {
    let el: HTMLElement;
    beforeEach(() => { el = document.createElement('span'); });

    it('sets DOM properties', () => {
        const update = bind(el, 'textContent');

        update('Hello');

        expect(el.textContent).toBe('Hello');
    });

    it('sets attributes when no DOM property exists', () => {
        const update = bind(el, 'data-state');

        update('ready');

        expect(el.getAttribute('data-state')).toBe('ready');
    });

    it('uses property aliases', () => {
        const update = bind(el, 'text');

        update('Ali');

        expect(el.textContent).toBe('Ali');
    });

    it('ignores nullish values', () => {
        el.textContent = 'Existing';
        const update = bind(el, 'textContent');

        update(null);
        update(undefined);

        expect(el.textContent).toBe('Existing');
    });

    it('class binding captures base class and replaces dynamic class', () => {
        el.className = 'base primary';
        const update = bind(el, 'class');

        update('active');
        expect(el.className).toBe('base primary active');

        update('done');
        expect(el.className).toBe('base primary done');
    });
});

describe('subscribe/publish', () => {
    it('subscribe registers a listener on a channel and runs it immediately', () => {
        const station: Station = {};
        let seen: unknown;

        subscribe(station, 'name', value => { seen = value; }, 'initial');

        expect(station.name).toHaveLength(1);
        expect(seen).toBe('initial');
    });

    it('publish calls every listener tuned to a channel', () => {
        const station: Station = {};
        const seen: number[] = [];
        subscribe(station, 'n', v => seen.push(Number(v)),     0);
        subscribe(station, 'n', v => seen.push(Number(v) * 2), 0);
        seen.length = 0;

        publish(station, 'n', 3);

        expect(seen).toEqual([3, 6]);
    });

    it('publish tolerates channels with no listeners', () => {
        const station: Station = {};

        expect(() => publish(station, 'absent', 1)).not.toThrow();
    });

    it('subscribe returns an Off that detaches the sub from its channel', () => {
        const station: Station = {};
        const seen: number[] = [];
        const off = subscribe(station, 'n', v => seen.push(Number(v)), 0);
        seen.length = 0;

        off();
        publish(station, 'n', 5);

        expect(station.n).toHaveLength(0);
        expect(seen).toEqual([]);
    });

    it('the Off is idempotent — a repeated call is a safe no-op', () => {
        const station: Station = {};
        const off = subscribe(station, 'n', () => {}, 0);
        subscribe(station, 'n', () => {}, 0);

        off();
        expect(() => off()).not.toThrow();
        expect(station.n).toHaveLength(1);
    });

    it('detaching one sub leaves the rest reachable — teardown is reference-based, not index-based', () => {
        const station: Station = {};
        const seen: string[] = [];
        subscribe(station, 'n', () => seen.push('a'), 0);
        const offB = subscribe(station, 'n', () => seen.push('b'), 0);
        subscribe(station, 'n', () => seen.push('c'), 0);
        seen.length = 0;

        offB();
        publish(station, 'n', 1);

        expect(seen).toEqual(['a', 'c']);
    });

    it('publish iterates a snapshot — a sub detaching another mid-broadcast does not skip it', () => {
        const station: Station = {};
        const seen: string[] = [];
        let offC = () => {};
        subscribe(station, 'n', () => { seen.push('a'); offC(); }, 0);
        subscribe(station, 'n', () => seen.push('b'), 0);
        offC = subscribe(station, 'n', () => seen.push('c'), 0);
        seen.length = 0;

        publish(station, 'n', 1);

        expect(seen).toEqual(['a', 'b', 'c']);   // 'c' still ran this pass
        expect(station.n).toHaveLength(2);        // but is detached for the next
    });

    it('unsubscribe is a no-op for a sub that is not on the channel', () => {
        const subs: Station['x'] = [];
        const orphan = () => {};

        expect(() => unsubscribe(orphan, subs)).not.toThrow();
        expect(subs).toHaveLength(0);
    });
});

describe('reconcile', () => {
    let container: HTMLElement;
    let cache: Map<unknown, Row>;
    let tpl: HTMLTemplateElement;

    beforeEach(() => {
        container = document.createElement('ul');
        cache     = new Map();
        tpl       = document.createElement('template');
        tpl.innerHTML = '<li></li>';
        document.body.appendChild(container);
    });

    const wakeText = (node: Element, row: Row | null) => {
        if (row) node.textContent = String(row.item.label);
    };

    it('appends one node per item', () => {
        reconcile(container, [
            { id: 1, label: 'One' },
            { id: 2, label: 'Two' },
        ], cache, tpl, wakeText);

        expect(container.querySelectorAll('li')).toHaveLength(2);
        expect(container.textContent).toBe('OneTwo');
    });

    it('reuses existing cache rows on re-render', () => {
        reconcile(container, [{ id: 1, label: 'One' }], cache, tpl, wakeText);
        const firstNode = container.firstElementChild;

        reconcile(container, [{ id: 1, label: 'Updated' }], cache, tpl, wakeText);

        expect(container.firstElementChild).toBe(firstNode);
    });

    it('broadcasts updated item values to existing row subs', () => {
        reconcile(container, [{ id: 1, label: 'One' }], cache, tpl, wakeText);
        const row = cache.get(1)!;
        (row.subs.label ??= []).push(value => { row.node.textContent = String(value); });

        reconcile(container, [{ id: 1, label: 'Updated' }], cache, tpl, wakeText);

        expect(container.textContent).toBe('Updated');
    });

    it('removes rows whose id is no longer in the data', () => {
        reconcile(container, [
            { id: 1, label: 'One' },
            { id: 2, label: 'Two' },
        ], cache, tpl, wakeText);

        reconcile(container, [{ id: 2, label: 'Two' }], cache, tpl, wakeText);

        expect(container.querySelectorAll('li')).toHaveLength(1);
        expect(cache.has(1)).toBe(false);
        expect(cache.has(2)).toBe(true);
    });

    it('uses item[keyProp] as the cache key', () => {
        reconcile(container, [{ uuid: 'a-1', label: 'One' }], cache, tpl, wakeText, 'uuid');

        expect(cache.has('a-1')).toBe(true);
    });

    it('falls back to JSON.stringify when key is missing', () => {
        const item = { label: 'No id' };

        reconcile(container, [item], cache, tpl, wakeText);

        expect(cache.has(JSON.stringify(item))).toBe(true);
    });

    it('does not manage empty-state DOM', () => {
        reconcile(container, [], cache, tpl, wakeText);

        expect(container.children).toHaveLength(0);
        expect(cache.size).toBe(0);
    });

    it('unwires an evicted row before dropping it', () => {
        reconcile(container, [
            { id: 1, label: 'One' },
            { id: 2, label: 'Two' },
        ], cache, tpl, wakeText);
        let torn = false;
        cache.get(1)!.unsubs.push(() => { torn = true; });

        reconcile(container, [{ id: 2, label: 'Two' }], cache, tpl, wakeText);

        expect(torn).toBe(true);
        expect(cache.has(1)).toBe(false);
    });

    it('leaves a surviving row\'s unsubs intact across re-render', () => {
        reconcile(container, [{ id: 1, label: 'One' }], cache, tpl, wakeText);
        cache.get(1)!.unsubs.push(() => {});

        reconcile(container, [{ id: 1, label: 'Updated' }], cache, tpl, wakeText);

        expect(cache.get(1)!.unsubs).toHaveLength(1);
    });
});

describe('unwire / unwake', () => {
    it('unwire runs every Off and empties the list', () => {
        const log: string[] = [];
        const unsubs = [() => log.push('a'), () => log.push('b')];

        unwire(unsubs);

        expect(log).toEqual(['a', 'b']);
        expect(unsubs).toHaveLength(0);
    });

    it('unwire is idempotent — a second call has nothing left to run', () => {
        let calls = 0;
        const unsubs = [() => { calls++; }];

        unwire(unsubs);
        unwire(unsubs);

        expect(calls).toBe(1);
    });

    it('unwake tears down the wrapper\'s own unsubs and every cached row\'s', () => {
        const log: string[] = [];
        const rowCache = new Map<unknown, Row>([
            [1, { node: document.createElement('li'), item: {}, subs: {}, unsubs: [() => log.push('row')] }],
        ]);
        const wrapper = {
            _unsubs: [() => log.push('wrapper')],
            _listCache: new Map([[document.createElement('ul'), rowCache]]),
        } as unknown as Wrapper;

        unwake(wrapper);

        expect(log.sort()).toEqual(['row', 'wrapper']);
        expect(wrapper._unsubs).toHaveLength(0);
        expect(rowCache.get(1)!.unsubs).toHaveLength(0);
    });
});
