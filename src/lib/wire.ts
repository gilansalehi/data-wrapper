import { CONFIG, VP_FORMATTERS } from './registry.ts';
import { applyBinding } from './engine.ts';
import type { UpdateConfig, Formatter } from './types.ts';

type ItemNode  = Element & { _vItem?: Record<string, unknown>; _vItemConfigs?: UpdateConfig[] };
type WokeNode  = Element & { _vWoke?: boolean };

// Public interface for component.ts to depend on without importing the class
export interface WrapperNode extends HTMLElement {
    state:        Record<string, unknown>;
    subs:         Record<string, UpdateConfig[]>;
    _actions:     Record<string, EventListener>;
    _boundEvents: Set<string>;
    _listCache:   Map<Element, Map<unknown, Element>>;
    _register(path: string, config: UpdateConfig): void;
}

// ---------------------------------------------------------------------------
// DWRL parsing
// ---------------------------------------------------------------------------

const parsePath = (attrValue: string) => {
    const qIdx     = attrValue.indexOf('?');
    const rawPath  = qIdx >= 0 ? attrValue.slice(0, qIdx) : attrValue;
    const queryStr = qIdx >= 0 ? attrValue.slice(qIdx + 1) : '';
    const params   = new URLSearchParams(queryStr);
    const pipes    = params.getAll('format')
        .map(n => VP_FORMATTERS.get(n))
        .filter((f): f is Formatter => !!f);

    return {
        rawPath,
        pipes,
        isItemScoped:    rawPath.startsWith('./'),
        isCrossWrapper:  rawPath.startsWith('//'),
        path: rawPath.replace(/^\.\//, '').replace(/^\/+/, ''),
    };
};

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

const _dispatchTopic = (wrapper: WrapperNode, e: Event, topic: string) => {
    const colonIdx = topic.indexOf(':');
    if (colonIdx > 0) {
        const scheme = topic.slice(0, colonIdx);
        const path   = topic.slice(colonIdx + 1).replace(/^\/\/[^/]*/, '').replace(/^\//, '');

        if (scheme === 'action') {
            const handler = wrapper._actions[path];
            if (handler) handler(e);
            return;
        }
    }
    wrapper.dispatchEvent(new CustomEvent(topic, { detail: e, bubbles: true }));
};

const _ensureDelegation = (wrapper: WrapperNode, eventName: string) => {
    if (wrapper._boundEvents.has(eventName)) return;
    wrapper._boundEvents.add(eventName);

    const attrName = `${CONFIG.TOKENS.EVT}${eventName}`;

    wrapper.addEventListener(eventName, (e: Event) => {
        // Walk up from target to find the element carrying @eventName
        let delegate: Element | null = null;
        let node: Element | null     = e.target as Element;
        while (node) {
            if (node.hasAttribute(attrName)) { delegate = node; break; }
            if (node === (wrapper as unknown as Element)) break;
            node = node.parentElement;
        }
        if (!delegate) return;

        (e as Event & { delegateTarget?: Element }).delegateTarget = delegate;

        // Walk up to find item context
        let scan: Element | null = delegate;
        while (scan) {
            if ((scan as ItemNode)._vItem) {
                (e as Event & { item?: unknown }).item = (scan as ItemNode)._vItem;
                break;
            }
            if (scan === (wrapper as unknown as Element)) break;
            scan = scan.parentElement;
        }

        _dispatchTopic(wrapper, e, delegate.getAttribute(attrName)!);
    });
};

// ---------------------------------------------------------------------------
// subscribe — wires one $ or _ attribute on an element
// ---------------------------------------------------------------------------

export const subscribe = (
    el: Element,
    mode: 'dynamic' | 'additive',
    attrName: string,
    attrValue: string,
    itemNode: Element | null = null,
) => {
    const wrapper = el.closest('data-wrapper') as WrapperNode | null;
    if (!wrapper) return;

    const prefix            = mode === 'dynamic' ? CONFIG.TOKENS.BIND : CONFIG.TOKENS.ADD;
    const prop              = attrName.slice(prefix.length);
    const { rawPath, path, pipes, isItemScoped, isCrossWrapper } = parsePath(attrValue);

    if (isCrossWrapper) return; // TODO: cross-wrapper mesh

    const config: UpdateConfig = { el, path, prop, pipes, itemNode };

    if (isItemScoped && itemNode) {
        // Item-scoped: never enters wrapper subs.
        // Store on itemNode so reconciler can re-apply when _vItem changes.
        ((itemNode as ItemNode)._vItemConfigs ??= []).push(config);
        // Initial render directly from _vItem
        let val: unknown = (itemNode as ItemNode)._vItem?.[path];
        for (const pipe of pipes) val = pipe(val);
        applyBinding(el, prop, val);
        return;
    }

    wrapper._register(path, config);
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree (replaces wakeElement + wakeTree)
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, itemNode: Element | null) => {
    if ((el as WokeNode)._vWoke) return;
    (el as WokeNode)._vWoke = true;

    const wrapper = el.closest('data-wrapper') as WrapperNode | null;
    if (!wrapper) return;

    const { BIND, ADD, EVT } = CONFIG.TOKENS;

    for (const { name, value } of [...el.attributes]) {
        if      (name.startsWith(BIND)) subscribe(el, 'dynamic',  name, value, itemNode);
        else if (name.startsWith(ADD))  subscribe(el, 'additive', name, value, itemNode);
        else if (name.startsWith(EVT))  _ensureDelegation(wrapper, name.slice(EVT.length));
    }
};

export const wake = (root: Element, itemNode: Element | null = null) => {
    _wireElement(root, itemNode);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => CONFIG.NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let el: Node | null;
    while ((el = walker.nextNode())) _wireElement(el as Element, itemNode);
};
