import { VP_FORMATTERS, VP_TEMPLATES } from './registry.ts';

type VNode = Element & { _vBase?: Set<string>; _vState?: { dynamic: string; additive: string } };
type ContainerNode = Element & { _vEmptyNode?: Element | null };
type ItemNode = Element & { _vItem?: unknown };

export const applyPipes = (rawValue: unknown, pipes: string[]): unknown => {
    if (!pipes || pipes.length === 0) return rawValue ?? '';
    return pipes.reduce((acc, p) => (VP_FORMATTERS.get(p) ? VP_FORMATTERS.get(p)!(acc) : acc), rawValue) ?? '';
};

export const syncClass = (el: VNode, val: string, type: 'dynamic' | 'additive') => {
    if (el._vBase === undefined) el._vBase = new Set([...el.classList]);
    el._vState = el._vState || { dynamic: '', additive: '' };
    el._vState[type] = val || '';
    el.className = ([...el._vBase].join(' ') + ` ${el._vState.dynamic} ${el._vState.additive}`).replace(/\s+/g, ' ').trim();
};

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
            const emptyTpl = VP_TEMPLATES.get(emptyName);
            const frag = emptyTpl
                ? (emptyTpl.content.cloneNode(true) as DocumentFragment)
                : (() => { const t = document.createElement('template'); t.innerHTML = '<slot></slot>'; return t.content.cloneNode(true) as DocumentFragment; })();
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
    const fragment = document.createDocumentFragment();

    data.forEach(item => {
        const id = item.id ?? JSON.stringify(item);
        activeIds.add(id);

        let node = cache.get(id);
        let isNew = false;

        if (!node) {
            node = (tpl.content.cloneNode(true) as DocumentFragment).firstElementChild!;
            cache.set(id, node);
            isNew = true;
        }

        (node as ItemNode)._vItem = item;
        if (isNew) hydrate(node, node);

        fragment.appendChild(node);
    });

    cache.forEach((node, id) => {
        if (!activeIds.has(id)) { node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
};
