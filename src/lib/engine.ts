import { VP_TEMPLATES, sync } from './registry.ts';
import type { UpdateConfig } from './types.ts';

type VNode       = Element & { _vBase?: Set<string>; _vState?: { dynamic: string; additive: string } };
type ItemElement = Element & { _vItem?: Record<string, unknown>; _vItemConfigs?: UpdateConfig[] };

// ---------------------------------------------------------------------------
// applyBinding — routes a resolved value to the correct DOM setter
// ---------------------------------------------------------------------------

export const applyBinding = (el: Element, prop: string, val: unknown) => {
    if (val === undefined || val === null) return;

    if (prop === 'class') {
        const v   = el as VNode;
        v._vBase  = v._vBase ?? new Set([...el.classList]);
        const s   = v._vState = v._vState ?? { dynamic: '', additive: '' };
        s.dynamic = String(val);
        el.className = ([...v._vBase].join(' ') + ' ' + s.dynamic + ' ' + s.additive)
            .replace(/\s+/g, ' ').trim();
        return;
    }

    sync(el, prop, val);
};

// ---------------------------------------------------------------------------
// applyItemBindings — re-applies item-scoped configs after _vItem changes
// ---------------------------------------------------------------------------

export const applyItemBindings = (node: Element, item: Record<string, unknown>) => {
    for (const config of (node as ItemElement)._vItemConfigs || []) {
        let val: unknown = item[config.path];
        for (const pipe of config.pipes) val = pipe(val);
        applyBinding(config.el, config.prop, val);
    }
};

// ---------------------------------------------------------------------------
// reconcile — O(N) list diff against a Map cache keyed by item.id
// ---------------------------------------------------------------------------

type ContainerNode = Element & { _vEmptyNode?: Element | null };

export const reconcile = (
    container: ContainerNode,
    data: Array<Record<string, unknown>>,
    cache: Map<unknown, Element>,
    tpl: HTMLTemplateElement,
    hydrate: (node: Element, itemNode: Element) => void,
) => {
    if (!data || data.length === 0) {
        cache.forEach(node => node.remove());
        cache.clear();

        if (!container._vEmptyNode) {
            const emptyName = container.getAttribute('data-empty') || 'vp-empty';
            const emptyTpl  = VP_TEMPLATES.get(emptyName);
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

    data.forEach(item => {
        const id   = item.id ?? JSON.stringify(item);
        activeIds.add(id);

        let node  = cache.get(id);
        let isNew = false;

        if (!node) {
            node  = (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild!;
            cache.set(id, node);
            isNew = true;
        }

        (node as ItemElement)._vItem = item;

        if (isNew) {
            hydrate(node, node);           // wake subtree; item-scoped bindings register + render
        } else {
            applyItemBindings(node, item); // re-apply local bindings with fresh item data
        }

        fragment.appendChild(node);
    });

    cache.forEach((node, id) => {
        if (!activeIds.has(id)) { node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
};
