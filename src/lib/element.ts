import {
    resolveSource,
    rootContext,
    unwake,
    wake,
    type BindingContext,
    type ListCache,
    type Wrapper,
    type WrapperLoader,
} from './engine.ts';
import {
    ComponentRuntime,
    type ComponentContext,
    type ComponentFactory,
    type ComponentInstance,
    type ComponentModule,
    type ComponentProps,
} from './component.ts';
import { p, type Off } from './utils.ts';

type ComponentModuleRecord = {
    viewURL: string;
    module:  Promise<ComponentModule>;
};

type ImportShim = (specifier: string) => Promise<ComponentModule>;
type ShimGlobal = typeof globalThis & { importShim?: ImportShim };

const componentModules = new Map<string, ComponentModuleRecord>();
let shimPromise: Promise<ImportShim> | undefined;
const viewSourceOrigin = new URL(document.baseURI).origin;
const isTrustedViewSource = (url: URL): boolean =>
    url.origin === viewSourceOrigin;

const canonicalViewURL = (url: URL) => {
    const canonical = new URL(url);
    canonical.search = '';
    canonical.hash = '';
    return canonical.href;
};

const shimSource = () =>
    document.querySelector<HTMLScriptElement>('script[data-shim-src]')?.dataset.shimSrc;

const loadShim = (): Promise<ImportShim> => {
    const global = globalThis as ShimGlobal;
    if (global.importShim) return Promise.resolve(global.importShim);
    if (shimPromise) return shimPromise;

    const src = shimSource();
    if (!src) return Promise.reject(new Error('No data-shim-src configured'));

    shimPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => global.importShim
            ? resolve(global.importShim)
            : reject(new Error(`Module shim ${src} did not expose importShim()`));
        script.onerror = () => reject(new Error(`Failed to load module shim ${src}`));
        document.head.append(script);
    });
    return shimPromise;
};

const isResolutionError = (error: unknown): error is TypeError =>
    error instanceof TypeError
    && /bare specifier|resolve(?: module)? specifier|does not resolve to a valid URL/i.test(error.message);

const importMappedModule = async (name: string): Promise<ComponentModule> => {
    const global = globalThis as ShimGlobal;
    if (global.importShim) return global.importShim(name);

    try {
        return await import(name) as ComponentModule;
    } catch (error) {
        if (!isResolutionError(error)) throw error;
        if (shimSource()) return (await loadShim())(name);
        throw new Error(
            `Could not resolve component module "${name}". Add es-module-shims with data-shim-src.`,
            { cause: error },
        );
    }
};

const importComponent = (
    script: HTMLScriptElement,
    viewURL: URL,
): Promise<ComponentModule> => {
    const name = script.dataset.module?.trim();
    const owner = canonicalViewURL(viewURL);
    if (!name) {
        throw new Error(`Component module ${viewURL.href} requires a data-module name`);
    }

    const existing = componentModules.get(name);
    if (existing) {
        if (existing.viewURL !== owner) {
            throw new Error(
                `Duplicate data-module "${name}" in ${viewURL.href}; ` +
                `already registered by ${existing.viewURL}`
            );
        }
        return existing.module;
    }

    const srcAttr = script.getAttribute('src');
    const moduleURL = srcAttr
        ? new URL(srcAttr, viewURL.href).href
        : URL.createObjectURL(new Blob([
            `${script.textContent ?? ''}\n//# sourceURL=${name}\n`,
        ], { type: 'text/javascript' }));

    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({ imports: { [name]: moduleURL } });
    document.head.append(importMap);

    const module = importMappedModule(name);
    componentModules.set(name, { viewURL: owner, module });
    return module;
};

const isCrossWrapperInputExpression = (raw: string): boolean =>
    raw.startsWith('//');

const isReservedInputProtocol = (protocol: string): boolean =>
    protocol !== 'dwrl:';

const resolveInputAssignment = (
    expr: string,
    ctx?: BindingContext,
): unknown => {
    if (ctx) {
        const { path, isRel, parent, host, protocol } = p(expr);
        if (isReservedInputProtocol(protocol)) return null;
        const source = resolveSource(ctx, path, isRel, parent, expr, host);
        if (source) return () => source.read();
    }

    if (isCrossWrapperInputExpression(expr)) {
        console.warn(`data-wrapper: unresolved cross-wrapper input "${expr}"`);
        return null;
    }

    return expr;
};

const inputProps = (
    src: string,
    url: URL,
    ctx?: BindingContext,
): ComponentProps => {
    const props:  Record<string, unknown> = Object.create(null);
    const seen = new Set<string>();

    for (const [name, value] of url.searchParams) {
        if (seen.has(name)) continue;
        seen.add(name);

        const expr = value === '' ? name : value;
        const assignment = resolveInputAssignment(expr, ctx);
        if (assignment == null) continue;

        props[name] = assignment;
    }

    props.url = src;
    return Object.freeze(props) as ComponentProps;
};

const isNestedWrapper = (wrapper: HTMLElement): boolean =>
    !!wrapper.parentElement?.closest('data-wrapper');

export class DataWrapper extends HTMLElement {
    declare _unsubs:     Off[];
    declare _listCache:  ListCache;
    declare _component?: ComponentRuntime;
    declare _loadedSrc?: string;
    private _disconnectQueued = false;

    constructor() {
        super();
        this._unsubs    = [];
        this._listCache = new Map();
    }

    connectedCallback() {
        const src = this.getAttribute('src');
        if (src) {
            if (isNestedWrapper(this)) return;
            // Already loaded this src — e.g. a DOM move (disconnect + reconnect):
            // keep the live component, don't reload. disconnectedCallback defers
            // teardown and skips it on reconnect, so the instance survives moves;
            // tearing down eagerly here would break that move-safety.
            if (this._loadedSrc === src) return;
            // Load errors throw by default (ticket 005): surface as an uncaught
            // rejection with src attribution rather than swallowing to the console.
            Promise.resolve(load(this, src)).catch((err: unknown) => {
                throw new Error(`<data-wrapper src="${src}"> failed to load`, { cause: err });
            });
        }
        else wake(this, rootContext(this), load);
    }

    disconnectedCallback() {
        if (this._disconnectQueued) return;
        this._disconnectQueued = true;
        queueMicrotask(() => {
            this._disconnectQueued = false;
            if (this.isConnected) return;
            // unwake before destroy so factory cleanups (registered via ctx.cleanup)
            // run while the component runtime is still live — an action can flush
            // state during teardown.
            unwake(this);
            this._component?.destroy();
            this._component = undefined;
            this._loadedSrc = undefined;
        });
    }
}

export const load: WrapperLoader = async (wrapper: Wrapper, src: string, ctx?: BindingContext) => {
    if (wrapper._loadedSrc === src) return;

    const url  = new URL(src, document.baseURI);
    if (!isTrustedViewSource(url)) {
        console.error(`data-wrapper: blocked cross-origin src "${src}"`);
        return;
    }

    const props = inputProps(src, url, ctx);
    const res  = await fetch(url);
    const html = await res.text();
    const tpl  = document.createElement('template');
    tpl.innerHTML = html;

    const scripts = tpl.content.querySelectorAll<HTMLScriptElement>(
        'script[type="module"][data-module]'
    );
    if (scripts.length > 1) {
        throw new Error(`Component view ${url.href} may contain only one data-module script`);
    }
    const script = scripts[0];

    let componentModule: ComponentModule | undefined;
    let instance: ComponentInstance | undefined;
    const factoryUnsubs: Off[] = [];
    if (script) {
        script.remove();
        componentModule = await importComponent(script, url);
        const factory = componentModule.default;
        if (factory !== undefined) {
            if (typeof factory !== 'function') {
                throw new Error(`Component module ${url.href} default export must be a factory function`);
            }
            try {
                const context: ComponentContext = Object.freeze({
                    wrapper,
                    url,
                    params: url.searchParams,
                    props,
                    cleanup: off => factoryUnsubs.push(off),
                });
                const created = (factory as ComponentFactory)(context);
                if (created != null && typeof created !== 'object') {
                    throw new Error(`Component module ${url.href} factory must return an object or nothing`);
                }
                instance = created as ComponentInstance | undefined;
            } catch (error) {
                for (const off of factoryUnsubs.splice(0)) off();
                throw error;
            }
        }
    }

    unwake(wrapper);
    wrapper._component?.destroy();
    wrapper.innerHTML = '';
    wrapper.append(tpl.content);
    wrapper._unsubs    = factoryUnsubs;
    wrapper._listCache = new Map();
    wrapper._component = componentModule
        ? new ComponentRuntime(wrapper, componentModule, instance)
        : undefined;
    // Commit _loadedSrc only after a successful wake() so a wake-time failure
    // leaves the wrapper retryable rather than marked-loaded (ticket 005).
    wake(wrapper, rootContext(wrapper), load);
    wrapper._loadedSrc = src;
};

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
}
