import { resolveTemplate, sync } from './registry.ts';

export type Effect<T = unknown> = (value: T) => void;

type VNode       = Element & { _vBase?: Set<string>; _vState?: { dynamic: string } };
type ItemElement = Element & { _vItem?: Record<string, unknown>; _vItemEffects?: Effect<Record<string, unknown>>[] };

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

export const applyItemBindings = (node: Element, item: Record<string, unknown>) => {
    for (const effect of (node as ItemElement)._vItemEffects || []) effect(item);
};

type ContainerNode = Element & { _vEmptyNode?: Element | null };

export const reconcile = (
    container: ContainerNode,
    data: Array<Record<string, unknown>>,
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

    for (const item of data) {
        const id  = item[keyProp] ?? JSON.stringify(item);
        activeIds.add(id);

        let node  = cache.get(id);
        let isNew = false;

        if (!node) {
            node  = (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild!;
            cache.set(id, node);
            isNew = true;
        }

        (node as ItemElement)._vItem = item;
        isNew ? hydrate(node, node) : applyItemBindings(node, item);
        fragment.appendChild(node);
    }

    cache.forEach((node, id) => {
        if (!activeIds.has(id)) { node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
};
