import { CONFIG, VP_FORMATTERS } from './registry.ts';
import { applyBinding } from './engine.ts';
import { on, emit } from './utils.ts';
import type { UpdateConfig } from './engine.ts';
import type { Formatter } from './registry.ts';

type ItemNode = Element & { _vItem?: Record<string, unknown>; _vItemConfigs?: UpdateConfig[] };
type WokeNode = Element & { _vWoke?: boolean };

export interface WrapperNode extends HTMLElement {
    state:        Record<string, unknown>;
    _subs:        Record<string, UpdateConfig[]>;
    _boundEvents: Set<string>;
    _listCache:   Map<Element, Map<unknown, Element>>;
    _sub(path: string, config: UpdateConfig): void;
}

// ---------------------------------------------------------------------------
// DWRL parsing — native new URL() is the entire parser
// ---------------------------------------------------------------------------

const DWRL_BASE = 'dwrl://x/';

const parsePath = (attrValue: string) => {
    const isItemScoped   = attrValue.startsWith('./');
    const isCrossWrapper = attrValue.startsWith('//');

    // ./foo → /foo: strip leading dot so URL parser treats it as an absolute path.
    // The isItemScoped flag above captures the original intent.
    const url   = new URL(isItemScoped ? attrValue.slice(1) : attrValue, DWRL_BASE);
    const pipes = url.searchParams.getAll('format')
        .map(n => VP_FORMATTERS.get(n))
        .filter((f): f is Formatter => !!f);

    return {
        pipes,
        isItemScoped,
        isCrossWrapper,
        key:       url.searchParams.get('key') ?? undefined,
        wrapperId: isCrossWrapper ? url.hostname : undefined,
        path:      url.pathname.slice(1), // URL always produces leading /; strip it
    };
};

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

export const ensureDelegation = (wrapper: WrapperNode, eventName: string) => {
    if (wrapper._boundEvents.has(eventName)) return;
    wrapper._boundEvents.add(eventName);

    const attrName = `${CONFIG.TOKENS.EVT}${eventName}`;

    // Listeners intentionally persist — no unsub. A delegate can always be added to the DOM later.
    on(eventName, (e: Event) => {
        const delegate = (e as Event & { delegateTarget?: Element }).delegateTarget;
        if (!delegate) return;
        emit(delegate.getAttribute(attrName)!, e, wrapper);
    }, `[${CSS.escape(attrName)}]`, wrapper);
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
    const { path, pipes, key, isItemScoped, isCrossWrapper } = parsePath(attrValue);

    if (isCrossWrapper) return; // TODO: cross-wrapper mesh

    const config: UpdateConfig = { el, path, prop, pipes, itemNode, key };

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
            // Wrapper lookup deferred — el may be detached during list hydration.
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
