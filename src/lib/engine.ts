import { DW_DIRECTIVES, resolveTemplate, sync } from './registry.ts';
import type { DirectiveHandler } from './registry.ts';

export type Effect<T = unknown> = (value: T) => void;
export type Item = Record<string, unknown>;
export type ItemNode = Element & { _vItem?: Item; _vItemEffects?: Effect<Item>[] };

type VNode       = Element & { _vBase?: Set<string>; _vState?: { dynamic: string } };

export const applyBinding = (el: Element, prop: string, val: unknown) => {
    if (val === undefined || val === null) return;

    if (prop === 'class') {
        const v   = el as VNode;
        v._vBase  = v._vBase ?? new Set([...el.classList]);
        const s   = v._vState = v._vState ?? { dynamic: '' };
        s.dynamic = String(val);
        el.className = ([...v._vBase].join(' ') + ' ' + s.dynamic)
            .replace(/\s+/g, ' ').trim();
        return;
    }

    sync(el, prop, val);
};

export const watchItem = (node: Element, effect: Effect<Item>) => {
    const itemNode = node as ItemNode;
    (itemNode._vItemEffects ??= []).push(effect);
    effect(itemNode._vItem || {});
};

export const applyItemBindings = (node: Element, item: Item) => {
    for (const effect of (node as ItemNode)._vItemEffects || []) effect(item);
};

type ContainerNode = Element & { _vEmptyNode?: Element | null };

export const reconcile = (
    container: ContainerNode,
    data: Item[],
    cache: Map<unknown, Element>,
    tpl: HTMLTemplateElement,
    hydrate: (node: Element, itemNode: Element) => void,
    keyProp = 'id',
) => {
    if (!data || data.length === 0) {
        cache.forEach(node => node.remove());
        cache.clear();

        if (!container._vEmptyNode) {
            const emptyName = container.getAttribute('data-empty') || 'dw-empty';
            const emptyTpl  = resolveTemplate(emptyName);
            const frag      = emptyTpl
                ? (emptyTpl.content.cloneNode(true) as DocumentFragment)
                : (() => {
                    const t = document.createElement('template');
                    t.innerHTML = '<span></span>';
                    return t.content.cloneNode(true) as DocumentFragment;
                })();
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
    const newNodes: Element[] = [];

    for (const item of data) {
        const id  = item[keyProp] ?? JSON.stringify(item);
        activeIds.add(id);

        let node  = cache.get(id);
        let isNew = false;

        if (!node) {
            node  = (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild!;
            cache.set(id, node);
            isNew = true;
            newNodes.push(node);
        }

        (node as ItemNode)._vItem = item;
        if (!isNew) applyItemBindings(node, item);
        fragment.appendChild(node);
    }

    cache.forEach((node, id) => {
        if (!activeIds.has(id)) { node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
    for (const node of newNodes) hydrate(node, node);
};

const listDirective: DirectiveHandler = ({ wrapper, el, value, key, hydrate }) => {
    const tpl = el.querySelector(':scope > template') as HTMLTemplateElement | null;
    if (!tpl) return;

    let cache = wrapper._listCache.get(el);
    if (!cache) {
        cache = new Map();
        wrapper._listCache.set(el, cache);
    }

    reconcile(el, (value as Item[]) || [], cache, tpl, hydrate, key);
};

DW_DIRECTIVES.set('list', listDirective);
