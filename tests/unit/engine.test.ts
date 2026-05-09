import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { bind, broadcast, reconcile, watch } from '@lib/engine.ts';
import type { Item, Row, Subs } from '@lib/engine.ts';

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

describe('watch/broadcast', () => {
    it('watch stores subscriber and runs it immediately', () => {
        const subs: Subs<string> = [];
        let seen = '';

        watch(subs, value => { seen = value; }, 'initial');

        expect(subs).toHaveLength(1);
        expect(seen).toBe('initial');
    });

    it('broadcast calls all subscribers', () => {
        const seen: number[] = [];
        const subs: Subs<number> = [
            value => seen.push(value),
            value => seen.push(value * 2),
        ];

        broadcast(subs, 3);

        expect(seen).toEqual([3, 6]);
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
        row.subs.push((item: Item) => { row.node.textContent = String(item.label); });

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
});
