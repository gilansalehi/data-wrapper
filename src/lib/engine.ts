import { DW_DIRECTIVES, resolveAlias, resolveTemplate } from './registry.ts';
import type { DirectiveHandler, Item, Row, Sub } from './registry.ts';

export type { Item, ListCache, Row, Sub } from './registry.ts';

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

    const alias = resolveAlias(prop);
    return val => set(el, alias, val);
};

export const watch = <T>(subs: Sub<T>[], sub: Sub<T>, value: T) => {
    subs.push(sub);
    sub(value);
};

export const broadcast = <T>(subs: Sub<T>[] = [], value: T) => {
    for (const sub of subs) sub(value);
};

type ContainerNode = Element & { _vEmptyNode?: Element | null };

export const reconcile = (
    container: ContainerNode,
    data: Item[],
    cache: Map<unknown, Row>,
    tpl: HTMLTemplateElement,
    hydrate: (node: Element, row: Row) => void,
    keyProp = 'id',
) => {
    if (!data || data.length === 0) {
        cache.forEach(row => row.node.remove());
        cache.clear();

        if (!container._vEmptyNode) {
            const emptyName = container.getAttribute('data-empty') || 'dw-empty';
            const emptyTpl  = resolveTemplate(emptyName);
            if (!emptyTpl) return;
            const frag = emptyTpl.content.cloneNode(true) as DocumentFragment;
            container._vEmptyNode = frag.firstElementChild ?? null;
            if (container._vEmptyNode) container.appendChild(container._vEmptyNode);
        }
        return;
    }

    if (container._vEmptyNode) {
        container._vEmptyNode.remove();
        container._vEmptyNode = null;
    }

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
    for (const row of newRows) hydrate(row.node, row);
};

const listDirective: DirectiveHandler = ({ wrapper, el, key, hydrate }) => {
    const tpl = el.querySelector(':scope > template') as HTMLTemplateElement | null;
    if (!tpl) return () => {};

    let cache = wrapper._listCache.get(el);
    if (!cache) {
        cache = new Map();
        wrapper._listCache.set(el, cache);
    }

    return value => reconcile(el, (value as Item[]) || [], cache, tpl, hydrate, key);
};

DW_DIRECTIVES.set('list', listDirective);
