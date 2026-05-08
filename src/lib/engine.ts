import { DW_DIRECTIVES, PROP_ALIASES, resolveTemplate } from './registry.ts';
import type { DirectiveHandler, Item, Row, Sub, Subs } from './registry.ts';

export type { Item, ListCache, Row, Sub, Subs, Wrapper } from './registry.ts';

const set = (el: Element, prop: string, val: unknown) => {
    if (val === undefined || val === null) return;
    if (prop in el) {
        (el as unknown as Record<string, unknown>)[prop] = val;
    } else {
        el.setAttribute(prop, String(val));
    }
};

export const bind = (el: Element, prop: string): Sub => {
    if (prop === 'class') {
        const base = el.className;
        return val => {
            if (val === undefined || val === null) return;
            set(el, 'className', (base + ' ' + String(val)).replace(/\s+/g, ' ').trim());
        };
    }

    const alias = PROP_ALIASES[prop] || prop;
    return val => set(el, alias, val);
};

export const watch = <T>(subs: Subs<T>, sub: Sub<T>, value: T) => {
    subs.push(sub);
    sub(value);
};

export const broadcast = <T>(subs: Subs<T> = [], value: T) => {
    for (const sub of subs) sub(value);
};

export const reconcile = (
    container: Element,
    data: Item[],
    cache: Map<unknown, Row>,
    tpl: HTMLTemplateElement,
    wake: (node: Element, row: Row | null) => void,
    keyProp = 'id',
) => {
    const activeIds = new Set<unknown>();
    const fragment  = document.createDocumentFragment();
    const newRows: Row[] = [];

    for (const item of data) {
        const id  = item[keyProp] ?? JSON.stringify(item);
        activeIds.add(id);

        let row   = cache.get(id);
        let isNew = false;

        if (!row) {
            row = {
                node: (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild!,
                item,
                subs: [],
            };
            cache.set(id, row);
            isNew = true;
            newRows.push(row);
        }

        row.item = item;
        if (!isNew) broadcast(row.subs, item);
        fragment.appendChild(row.node);
    }

    cache.forEach((row, id) => {
        if (!activeIds.has(id)) { row.node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
    for (const row of newRows) wake(row.node, row);
};

const listDirective: DirectiveHandler = ({ wrapper, el, key, wake }) => {
    const tpl = el.querySelector(':scope > template') as HTMLTemplateElement | null;
    if (!tpl) return () => {};

    let cache = wrapper._listCache.get(el);
    if (!cache) {
        cache = new Map();
        wrapper._listCache.set(el, cache);
    }

    const identityKey = key || 'id';
    let emptyNode: Element | null = null;

    const clearRows = () => {
        cache.forEach(row => row.node.remove());
        cache.clear();
    };

    const showEmpty = () => {
        if (emptyNode?.parentElement === el) return;

        const emptyName = el.getAttribute('data-empty') || 'dw-empty';
        const emptyTpl  = resolveTemplate(emptyName);
        const frag = emptyTpl?.content.cloneNode(true) as DocumentFragment;
        emptyNode  = frag.firstElementChild ?? null;
        if (!emptyNode) return;

        emptyNode.setAttribute('_empty', '');
        el.appendChild(emptyNode);
        wake(emptyNode, null);
    };

    const hideEmpty = () => {
        emptyNode?.remove();
        emptyNode = null;
    };

    return value => {
        const items = Array.isArray(value) ? value : [];

        if (items.length === 0) {
            clearRows();
            showEmpty();
            return;
        }

        hideEmpty();
        reconcile(el, items, cache, tpl, wake, identityKey);
    };
};

DW_DIRECTIVES.set('list', listDirective);
