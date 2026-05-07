import { CONFIG, VP_FORMATTERS } from './registry.ts';
import { syncClass } from './engine.ts';
import { sync } from './registry.ts';
import type { UpdateConfig } from './types.ts';

type ItemNode = Element & { _vItem?: Record<string, unknown> };
type WokeNode = Element & { _vWoke?: boolean };

interface WrapperNode extends HTMLElement {
    state: Record<string, unknown>;
    subs: Record<string, UpdateConfig[]>;
    register(path: string, updater: UpdateConfig): void;
}

export const update = (wrapper: WrapperNode, config: UpdateConfig, manualVal?: unknown): boolean => {
    const { el, path, prop, pipes, itemNode } = config;
    if (!el.isConnected) return false;

    let val = manualVal !== undefined
        ? manualVal
        : ((itemNode as ItemNode)?._vItem?.[path] ?? wrapper.state[path]);

    for (const pipe of pipes) val = pipe(val);

    if (prop === 'class') syncClass(el, String(val ?? ''), 'dynamic');
    else sync(el, prop, val);

    return true;
};

export const subscribe = (el: Element, mode: 'dynamic' | 'additive', attrName: string, attrValue: string, itemNode: Element | null = null) => {
    const wrapper = el.closest('data-wrapper') as WrapperNode | null;
    if (!wrapper) return;

    const prefix = mode === 'dynamic' ? CONFIG.TOKENS.BIND : CONFIG.TOKENS.ADD;
    const [path, ...pipeNames] = attrValue.split('|').map(s => s.trim());

    const config: UpdateConfig = {
        el,
        path,
        prop: attrName.slice(prefix.length),
        pipes: pipeNames.map(name => VP_FORMATTERS.get(name)).filter((f): f is (v: unknown) => unknown => !!f),
        itemNode,
    };

    wrapper.register(path, config);
};

export const wakeElement = (el: Element, itemNode: Element | null = null) => {
    if ((el as WokeNode)._vWoke) return;
    (el as WokeNode)._vWoke = true;

    const wrapper = el.closest('data-wrapper') as WrapperNode | null;
    if (!wrapper) return;

    const { BIND, ADD, EVT } = CONFIG.TOKENS;

    for (const { name, value } of [...el.attributes]) {
        if (name.startsWith(BIND)) subscribe(el, 'dynamic', name, value, itemNode);
        else if (name.startsWith(ADD)) subscribe(el, 'additive', name, value, itemNode);
        else if (name.startsWith(EVT)) {
            const eventName = name.slice(EVT.length);
            wrapper.addEventListener(eventName, (e: Event) => {
                const ev = e as Event & { delegateTarget?: Element | null };
                const topic = ev.delegateTarget?.getAttribute(name);
                if (!topic) return;
                const detail = itemNode ? { item: (itemNode as ItemNode)._vItem, event: e } : e;
                wrapper.dispatchEvent(new CustomEvent(topic, { detail, bubbles: true }));
            });
        }
    }
};

export const wakeTree = (root: Element, _wrapper: WrapperNode, itemNode: Element | null = null) => {
    const { SHOW_ELEMENT, FILTER_ACCEPT, FILTER_REJECT } = NodeFilter;

    const walker = document.createTreeWalker(root, SHOW_ELEMENT, {
        acceptNode: (n: Node) => CONFIG.NO_WAKE.includes((n as Element).tagName)
            ? FILTER_REJECT
            : FILTER_ACCEPT,
    });

    wakeElement(root, itemNode);
    let el: Node | null;
    while ((el = walker.nextNode())) wakeElement(el as Element, itemNode);
};
