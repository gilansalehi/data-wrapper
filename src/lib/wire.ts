import { CONFIG, VP_FORMATTERS } from './registry.ts';
import { on } from './utils.ts';
import { applyBinding } from './engine.ts';
import type { UpdateConfig } from './engine.ts';
import type { Formatter } from './registry.ts';

type ItemNode = Element & { _vItem?: Record<string, unknown>; _vItemConfigs?: UpdateConfig[] };
type WokeNode = Element & { _vWoke?: boolean };

export interface WrapperNode extends HTMLElement {
    state:      Record<string, unknown>;
    _subs:      Record<string, UpdateConfig[]>;
    _actions:   Record<string, EventListener>;
    _listeners: Map<string, () => void>;
    _listCache: Map<Element, Map<unknown, Element>>;
    _sub(path: string, config: UpdateConfig): void;
}

// ---------------------------------------------------------------------------
// DWRL parsing
// ---------------------------------------------------------------------------

const parsePath = (attrValue: string) => {
    const qIdx     = attrValue.indexOf('?');
    const rawPath  = qIdx >= 0 ? attrValue.slice(0, qIdx) : attrValue;
    const queryStr = qIdx >= 0 ? attrValue.slice(qIdx + 1) : '';
    const pipes    = new URLSearchParams(queryStr).getAll('format')
        .map(n => VP_FORMATTERS.get(n))
        .filter((f): f is Formatter => !!f);

    return {
        pipes,
        isItemScoped:   rawPath.startsWith('./'),
        isCrossWrapper: rawPath.startsWith('//'),
        path: rawPath.replace(/^\.\//, '').replace(/^\/+/, ''),
    };
};

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

const _dispatchTopic = (wrapper: WrapperNode, e: Event, topic: string) => {
    const sep = topic.indexOf(':');
    if (sep > 0) {
        const scheme = topic.slice(0, sep);
        const path   = topic.slice(sep + 1).replace(/^\/\/[^/]*/, '').replace(/^\//, '');
        if (scheme === 'action') {
            wrapper._actions[path]?.(e);
            return;
        }
    }
    wrapper.dispatchEvent(new CustomEvent(topic, { detail: e, bubbles: true }));
};

export const ensureDelegation = (wrapper: WrapperNode, eventName: string) => {
    if (wrapper._listeners.has(eventName)) return;

    const attrName = `${CONFIG.TOKENS.EVT}${eventName}`;

    const unsub = on(eventName, (e: Event) => {
        let delegate: Element | null = null;
        let node: Element | null     = e.target as Element;
        while (node) {
            if (node.hasAttribute(attrName)) { delegate = node; break; }
            if (node === (wrapper as unknown as Element)) break;
            node = node.parentElement;
        }
        if (!delegate) return;

        (e as Event & { delegateTarget?: Element }).delegateTarget = delegate;

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
    }, '', wrapper as unknown as Element);

    wrapper._listeners.set(eventName, unsub);
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
    const prefix = mode === 'dynamic' ? CONFIG.TOKENS.BIND : CONFIG.TOKENS.ADD;
    const prop   = attrName.slice(prefix.length);
    const { path, pipes, isItemScoped, isCrossWrapper } = parsePath(attrValue);

    if (isCrossWrapper) return; // TODO: cross-wrapper mesh

    const config: UpdateConfig = { el, path, prop, pipes, itemNode };

    if (isItemScoped && itemNode) {
        // Never enters wrapper _subs. Stored on itemNode so reconciler can re-apply on update.
        ((itemNode as ItemNode)._vItemConfigs ??= []).push(config);
        let val: unknown = (itemNode as ItemNode)._vItem?.[path];
        for (const pipe of pipes) val = pipe(val);
        applyBinding(el, prop, val);
        return;
    }

    // Wrapper-root binding — requires DOM ancestry.
    const wrapper = el.closest('data-wrapper') as WrapperNode | null;
    if (!wrapper) return;
    wrapper._sub(path, config);
};

// ---------------------------------------------------------------------------
// wake — wires one element then walks its subtree
// ---------------------------------------------------------------------------

const _wireElement = (el: Element, itemNode: Element | null) => {
    if ((el as WokeNode)._vWoke) return;
    (el as WokeNode)._vWoke = true;

    const { BIND, ADD, EVT } = CONFIG.TOKENS;

    for (const { name, value } of [...el.attributes]) {
        if      (name.startsWith(BIND)) subscribe(el, 'dynamic',  name, value, itemNode);
        else if (name.startsWith(ADD))  subscribe(el, 'additive', name, value, itemNode);
        else if (name.startsWith(EVT)) {
            // Wrapper lookup is deferred here — el may be detached during list hydration.
            // Template event types are pre-registered by _directive before reconcile runs.
            const wrapper = el.closest('data-wrapper') as WrapperNode | null;
            if (wrapper) ensureDelegation(wrapper, name.slice(EVT.length));
        }
    }
};

export const wake = (root: Element, itemNode: Element | null = null) => {
    _wireElement(root, itemNode);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n: Node) => CONFIG.NO_WAKE.includes((n as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
    });

    let node: Node | null;
    while ((node = walker.nextNode())) _wireElement(node as Element, itemNode);
};
