import { cloneTemplate, DW_DIRECTIVES, PROP_ALIASES, resolveTemplate } from './registry.ts';
import type { DirectiveHandler, Item, Row, Station, Sub, Subs } from './registry.ts';
import { readPath } from './utils.ts';

export type { Item, ListCache, Row, Station, Sub, Subs, Wrapper } from './registry.ts';

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

// #region subscriptions
// @docs The framework's update primitive. `subscribe()` adds a sub to a
// Station channel and runs it once for the initial render; `publish()` calls
// every sub on a channel with a new value. A Station is `Record<channel, Subs>`
// — the wrapper has one (`_subs`) and every `*list` row carries its own
// (`row.subs`). Bindings, directives, and list rows all compose from this
// primitive.
export const subscribe = (station: Station, channel: string, sub: Sub, value: unknown) => {
    (station[channel] ??= []).push(sub);
    sub(value);
};

export const publish = (station: Station, channel: string, value: unknown) => {
    for (const sub of station[channel] ?? []) sub(value);
}
// #endregion

// #region reconcile
// @docs How `*list` stays cheap. `reconcile()` walks incoming items, reuses
// cached rows by identity key, publishes the updated item into each row's
// subscribers (no DOM rebuild for unchanged rows), removes rows whose ids
// dropped out, and appends new rows through a `DocumentFragment` before waking
// them. The DOM node is rendered output; the row record is the framework state.
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
                node: cloneTemplate(tpl)!,
                item,
                subs: {},
            };
            cache.set(id, row);
            isNew = true;
            newRows.push(row);
        }

        row.item = item;
        if (!isNew) {
            for (const channel in row.subs) publish(row.subs, channel, readPath(item, channel));
        }
        fragment.appendChild(row.node);
    }

    cache.forEach((row, id) => {
        if (!activeIds.has(id)) { row.node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
    for (const row of newRows) wake(row.node, row);
};
// #endregion

// #region list-directive
// @docs Reconciles a child `<template>` against an array. Reuses rows by
// identity (default key `id`; override with `?key=field`), publishes updated
// values into existing row subscribers, and renders a `data-empty` template
// when the array is empty.
const listDirective: DirectiveHandler = ({ wrapper, el, key, wake }) => {
    const tpl = el.querySelector(':scope > template') as HTMLTemplateElement | null;
    if (!tpl) return () => {};

    let cache = wrapper._listCache.get(el);
    if (!cache) {
        cache = new Map();
        wrapper._listCache.set(el, cache);
    }

    const identityKey = key || 'id';
    const wakeOwned = (node: Element, row: Row | null = null) => wake(node, row, wrapper);
    let emptyNode: Element | null = null;

    const clearRows = () => {
        cache.forEach(row => row.node.remove());
        cache.clear();
    };

    const showEmpty = () => {
        if (emptyNode?.parentElement === el) return;

        const emptyName = el.getAttribute('data-empty') || 'dw-empty';
        const emptyTpl  = resolveTemplate(emptyName);
        emptyNode = cloneTemplate(emptyTpl);
        if (!emptyNode) return;

        emptyNode.setAttribute('_empty', '');
        el.appendChild(emptyNode);
        wakeOwned(emptyNode);
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
        reconcile(el, items, cache, tpl, wakeOwned, identityKey);
    };
};
// #endregion

// #region if-directive
// @docs Toggles an element's presence in the DOM. When the value is falsy,
// the element is replaced with a comment anchor; when truthy, it returns to
// its place and re-wakes. Useful for conditionally rendered fragments inside
// list rows or wrapper roots.
const ifDirective: DirectiveHandler = ({ wrapper, el, row, wake }) => {
    const anchor = document.createComment('dw-if');

    const show = () => {
        if (el.isConnected) return;
        anchor.replaceWith(el);
        wake(el, row ?? null, wrapper);
    };

    const hide = () => {
        if (!el.isConnected) return;
        el.replaceWith(anchor);
    };

    return value => {
        if (value) show();
        else hide();
    };
};
// #endregion

DW_DIRECTIVES.set('list', listDirective);
DW_DIRECTIVES.set('if', ifDirective);
