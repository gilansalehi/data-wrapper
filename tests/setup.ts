import { Window, PropertySymbol } from 'happy-dom';
import '@testing-library/jest-dom';

const win = new Window({ url: 'http://localhost:3000/' });

// Re-stamp the internal window→document link using the Symbol from this
// module scope, so querySelectorAll can find it regardless of preload isolation.
(win.document as unknown as Record<symbol, unknown>)[PropertySymbol.window] = win;

Object.assign(globalThis, {
    window:           win,
    document:         win.document,
    Node:             win.Node,
    Element:          win.Element,
    HTMLElement:      win.HTMLElement,
    DocumentFragment: win.DocumentFragment,
    MutationObserver: win.MutationObserver,
    CustomEvent:      win.CustomEvent,
    Event:            win.Event,
    customElements:   win.customElements,
    NodeFilter:       win.NodeFilter,
    CSS:              win.CSS,
});
