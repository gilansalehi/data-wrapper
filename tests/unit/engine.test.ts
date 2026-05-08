import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { applyBinding, applyItemBindings, reconcile } from '@lib/engine.ts';
import type { UpdateConfig } from '@lib/engine.ts';

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('applyBinding', () => {
    let el: HTMLElement;
    beforeEach(() => { el = document.createElement('span'); });

    it('sets el.textContent when prop is "textContent"', () => {
        applyBinding(el, 'textContent', 'Hello');

        expect(el.textContent).toBe('Hello');
    });

    it('sets el[prop] for arbitrary props', () => {
        const input = document.createElement('input');

        applyBinding(input, 'value', 'draft');

        expect(input.value).toBe('draft');
    });

    it('ignores null value (does not overwrite)', () => {
        el.textContent = 'Existing';

        applyBinding(el, 'textContent', null);

        expect(el.textContent).toBe('Existing');
    });

    it('ignores undefined value', () => {
        el.textContent = 'Existing';

        applyBinding(el, 'textContent', undefined);

        expect(el.textContent).toBe('Existing');
    });

    it('class: appends dynamic class to existing base classes', () => {
        el.className = 'base';

        applyBinding(el, 'class', 'active');

        expect(el.className).toBe('base active');
    });

    it('class: replaces previous dynamic class on repeated calls', () => {
        el.className = 'base';

        applyBinding(el, 'class', 'active');
        applyBinding(el, 'class', 'done');

        expect(el.className).toBe('base done');
    });

    it('class: preserves base classes across dynamic updates', () => {
        el.className = 'base primary';

        applyBinding(el, 'class', 'active');
        applyBinding(el, 'class', 'done');

        expect(el.className).toBe('base primary done');
    });
});

describe('applyItemBindings', () => {
    const withItemConfigs = (node: Element, configs: UpdateConfig[]) => {
        (node as Element & { _vItemConfigs?: UpdateConfig[] })._vItemConfigs = configs;
    };

    it('applies all configs stored on node._vItemConfigs', () => {
        const node = document.createElement('li');
        node.innerHTML = '<span></span><input>';
        const span = node.querySelector('span')!;
        const input = node.querySelector('input')!;
        withItemConfigs(node, [
            { el: span, path: 'task', prop: 'textContent', pipes: [], itemNode: node },
            { el: input, path: 'id', prop: 'value', pipes: [], itemNode: node },
        ]);

        applyItemBindings(node, { id: 7, task: 'Ship tests' });

        expect(span.textContent).toBe('Ship tests');
        expect(input.value).toBe('7');
    });

    it('pipes are applied left-to-right before binding', () => {
        const node = document.createElement('li');
        const span = document.createElement('span');
        node.appendChild(span);
        withItemConfigs(node, [{
            el: span,
            path: 'task',
            prop: 'textContent',
            pipes: [
                v => String(v).trim(),
                v => String(v).toUpperCase(),
            ],
            itemNode: node,
        }]);

        applyItemBindings(node, { task: '  ship tests  ' });

        expect(span.textContent).toBe('SHIP TESTS');
    });

    it('does nothing when _vItemConfigs is absent', () => {
        const node = document.createElement('li');

        expect(() => applyItemBindings(node, { task: 'Ship tests' })).not.toThrow();
        expect(node.textContent).toBe('');
    });
});

describe('reconcile', () => {
    let container: HTMLElement;
    let cache: Map<unknown, Element>;
    let tpl: HTMLTemplateElement;

    beforeEach(() => {
        container = document.createElement('ul');
        cache     = new Map();
        tpl       = document.createElement('template');
        tpl.innerHTML = '<li></li>';
        document.body.appendChild(container);
    });

    const hydrateText = (node: Element, itemNode: Element) => {
        const item = (itemNode as Element & { _vItem?: Record<string, unknown> })._vItem!;
        node.textContent = String(item.label);
    };

    it('appends one node per item', () => {
        reconcile(container, [
            { id: 1, label: 'One' },
            { id: 2, label: 'Two' },
        ], cache, tpl, hydrateText);

        expect(container.querySelectorAll('li')).toHaveLength(2);
        expect(container.textContent).toBe('OneTwo');
    });

    it('reuses existing cache nodes on re-render', () => {
        reconcile(container, [{ id: 1, label: 'One' }], cache, tpl, hydrateText);
        const firstNode = container.firstElementChild;

        reconcile(container, [{ id: 1, label: 'Updated' }], cache, tpl, hydrateText);

        expect(container.firstElementChild).toBe(firstNode);
    });

    it('removes nodes whose id is no longer in the data', () => {
        reconcile(container, [
            { id: 1, label: 'One' },
            { id: 2, label: 'Two' },
        ], cache, tpl, hydrateText);

        reconcile(container, [{ id: 2, label: 'Two' }], cache, tpl, hydrateText);

        expect(container.querySelectorAll('li')).toHaveLength(1);
        expect(cache.has(1)).toBe(false);
        expect(cache.has(2)).toBe(true);
    });

    it('uses item[keyProp] as the cache key', () => {
        reconcile(container, [{ uuid: 'a-1', label: 'One' }], cache, tpl, hydrateText, 'uuid');

        expect(cache.has('a-1')).toBe(true);
    });

    it('falls back to JSON.stringify when key is missing', () => {
        const item = { label: 'No id' };

        reconcile(container, [item], cache, tpl, hydrateText);

        expect(cache.has(JSON.stringify(item))).toBe(true);
    });

    it('shows empty-state node when data is empty', () => {
        const empty = document.createElement('template');
        empty.id = 'empty-state';
        empty.innerHTML = '<li class="empty">Nothing here</li>';
        document.body.appendChild(empty);
        container.dataset.empty = 'empty-state';

        reconcile(container, [], cache, tpl, hydrateText);

        expect(container.querySelector('.empty')?.textContent).toBe('Nothing here');
    });

    it('removes empty-state node when data becomes non-empty', () => {
        const empty = document.createElement('template');
        empty.id = 'empty-state';
        empty.innerHTML = '<li class="empty">Nothing here</li>';
        document.body.appendChild(empty);
        container.dataset.empty = 'empty-state';

        reconcile(container, [], cache, tpl, hydrateText);
        reconcile(container, [{ id: 1, label: 'One' }], cache, tpl, hydrateText);

        expect(container.querySelector('.empty')).toBeNull();
        expect(container.querySelector('li')?.textContent).toBe('One');
    });

    it('calls hydrate for new nodes, applyItemBindings for updates', () => {
        tpl.innerHTML = '<li><span></span></li>';
        let hydrateCalls = 0;
        const hydrate = (node: Element, itemNode: Element) => {
            hydrateCalls += 1;
            const span = node.querySelector('span')!;
            (itemNode as Element & { _vItemConfigs?: UpdateConfig[] })._vItemConfigs = [{
                el: span,
                path: 'label',
                prop: 'textContent',
                pipes: [],
                itemNode,
            }];
            applyItemBindings(itemNode, (itemNode as Element & { _vItem?: Record<string, unknown> })._vItem!);
        };

        reconcile(container, [{ id: 1, label: 'One' }], cache, tpl, hydrate);
        reconcile(container, [{ id: 1, label: 'Updated' }], cache, tpl, hydrate);

        expect(hydrateCalls).toBe(1);
        expect(container.querySelector('span')?.textContent).toBe('Updated');
    });
});
