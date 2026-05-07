// =============================================================================
// data-wrapper — Public Type Declarations
// =============================================================================

// --- Primitives --------------------------------------------------------------

export type Formatter = (v: unknown) => unknown;
export type Unsubscribe = () => void;
export type SubscribeMode = 'dynamic' | 'additive';
export type SyncType = 'dynamic' | 'additive';

// --- Internal Structures -----------------------------------------------------

export interface UpdateConfig {
    el: Element;
    /** The state key path this binding is subscribed to */
    path: string;
    /** The DOM property or attribute to write to */
    prop: string;
    /** Pre-resolved pipe functions applied in order */
    pipes: Formatter[];
    /** The list item node that owns this binding's scope, if inside $list */
    itemNode: Element | null;
}

export interface DWRLResult {
    authority: string;
    segments: string[];
    property: string;
    params: Record<string, string>;
}

export interface DWRLVerbResult {
    verb: string;
    scheme: string;
    host: string;
    storage: string;
    path: string;
    hash: string;
    query: URLSearchParams;
    pipes: string[];
    absoluteAddress: string;
}

export interface Tokens {
    BIND: string;  // $ — downward data binding
    ADD: string;   // _ — additive class binding
    EVT: string;   // @ — event wiring
}

export interface Config {
    TOKENS: Tokens;
    NO_WAKE: string[];
}

// --- Utilities ---------------------------------------------------------------

/** querySelector shorthand — returns all matching elements as an array */
export declare function q(selector: string, ctx?: Element | Document): Element[];

/** querySelector + map shorthand */
export declare function qcb(
    selector: string,
    cb?: (el: Element) => unknown,
    ctx?: Element | Document
): unknown[];

/** Dispatch a CustomEvent from ctx (default: document) */
export declare function emit(eventName: string, payload?: unknown, ctx?: Element | Document): void;

/** Attach a delegated or direct event listener. Returns the unsubscribe function. */
export declare function on(
    eventName: string,
    cb: EventListener,
    delegate?: string,
    ctx?: Element | Document
): Unsubscribe;

/** Write a value to a DOM property or attribute, respecting PROP_ALIASES */
export declare function sync(el: Element, prop: string, val: unknown): void;

/** Resolve a shorthand prop name (e.g. "text") to its DOM equivalent ("textContent") */
export declare function resolveAlias(key: string): string;

// --- Registry ----------------------------------------------------------------

export declare const CONFIG: Config;

/** Named <template> elements registered for use as $list / $if / empty-state slots */
export declare const VP_TEMPLATES: Map<string, HTMLTemplateElement>;

/**
 * Named pipe functions applied via `| pipeName` in binding expressions.
 * Built-ins: count, fallback, json, upper, lower, currency, date, trim, bool
 */
export declare const VP_FORMATTERS: Map<string, Formatter>;

/** Shorthand prop → DOM property name mappings (e.g. "text" → "textContent") */
export declare const PROP_ALIASES: Record<string, string>;

// --- Engine ------------------------------------------------------------------

/** Apply a sequence of named pipe formatters to a value */
export declare function applyPipes(rawValue: unknown, pipes: string[]): unknown;

/** Manage dynamic or additive class bindings on an element */
export declare function syncClass(el: Element, val: string, type: SyncType): void;

/** Key-based DOM reconciler for $list bindings — diffs against a Map cache */
export declare function reconcile(
    container: Element,
    data: Array<Record<string, unknown>>,
    cache: Map<unknown, Element>,
    tpl: HTMLTemplateElement,
    hydrate: (node: Element, itemNode: Element) => void
): void;

/** Wire a $ or _ attribute on an element into the nearest DataWrapper's subscription map */
export declare function subscribe(
    el: Element,
    mode: SubscribeMode,
    attrName: string,
    attrValue: string,
    itemNode?: Element | null
): void;

/** Parse all binding/event attributes on a single element and register them */
export declare function wakeElement(el: Element, itemNode?: Element | null): void;

/** Walk an element subtree and call wakeElement on every non-excluded node */
export declare function wakeTree(
    root: Element,
    wrapper: DataWrapper,
    itemNode?: Element | null
): void;

/** Execute a single UpdateConfig binding, resolving its value and writing to the DOM */
export declare function update(
    wrapper: DataWrapper,
    config: UpdateConfig,
    manualVal?: unknown
): boolean;

// --- Component ---------------------------------------------------------------

export declare class DataWrapper extends HTMLElement {
    /**
     * Reactive proxy over the element's `dataset`.
     * - **get**: parses stored JSON automatically
     * - **set**: serialises objects/arrays to JSON, primitives to string
     */
    state: Record<string, unknown>;

    /** path → registered UpdateConfig callbacks */
    subs: Record<string, UpdateConfig[]>;

    // State Mutation API

    /** Set a key. Accepts a plain value or an updater function `(prev) => next`. */
    put(key: string, val: unknown | ((prev: unknown) => unknown)): void;

    /** Shallow-merge an object into an existing object value */
    patch(key: string, obj: Record<string, unknown>): void;

    /** Append an item to an existing array value */
    push(key: string, item: unknown): void;

    /** Remove items from an array value. Pass a predicate or a plain id value. */
    pull(key: string, predicate: ((item: unknown) => boolean) | unknown): void;

    // DWRL

    /** Parse a DWRL address string into a structured request object */
    parseDWRL(input: string, base?: string): DWRLResult;

    /** Full DWRL parser including explicit verb extraction */
    parseDWRL2(rawString: string, baseUrl: string): DWRLVerbResult;

    // Internal Lifecycle

    /** Register an UpdateConfig for a given state path and trigger an initial sync */
    register(path: string, updater: UpdateConfig): void;

    connectedCallback(): void;
    disconnectedCallback(): void;

    // Bridged Utilities
    // These are the standalone utilities re-bound so `this` element is the default ctx.

    q(selector: string): Element[];
    qcb(selector: string, cb?: (el: Element) => unknown): unknown[];
    on(eventName: string, cb: EventListener, delegate?: string): Unsubscribe;
    emit(eventName: string, payload?: unknown): void;
}

// --- Global Augmentation -----------------------------------------------------

declare global {
    interface HTMLElementTagNameMap {
        'data-wrapper': DataWrapper;
    }
    interface Window {
        /** Override framework defaults before the script loads */
        VP_CUSTOM_CONFIG?: Partial<Config>;
    }
    interface DocumentEventMap {
        /** Fired on document when a DataWrapper finishes connectedCallback */
        'data-wrapper:load': CustomEvent<DataWrapper>;
    }
    interface HTMLElementEventMap {
        /** Fired on the DataWrapper element when state changes via put/patch/push/pull */
        'data:sync': CustomEvent<{ key: string }>;
    }
}
