import {
    isBareBindingPath,
    resolveSource,
    rootContext,
    setWrapperLoader,
    unwake,
    wake,
    type BindingContext,
    type ListCache,
    type Wrapper,
} from './engine.ts';
import {
    ComponentRuntime,
    type ComponentContext,
    type ComponentFactory,
    type ComponentInstance,
    type ComponentModule,
    type ComponentProps,
} from './component.ts';
import type { Off } from './utils.ts';

type ComponentModuleRecord = {
    viewURL: string;
    module:  Promise<ComponentModule>;
};

type ImportShim = (specifier: string) => Promise<ComponentModule>;
type ShimGlobal = typeof globalThis & { importShim?: ImportShim };

const componentModules = new Map<string, ComponentModuleRecord>();
let shimPromise: Promise<ImportShim> | undefined;

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
        if (!shimSource() || !isResolutionError(error)) throw error;
        return (await loadShim())(name);
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

export class DataWrapper extends HTMLElement {
    declare _unsubs:     Off[];
    declare _listCache:  ListCache;
    declare _component?: ComponentRuntime;
    declare _parentContext?: BindingContext;
    declare _loadedSrc?: string;
    declare _loadingSrc?: string;
    private _disconnectQueued = false;

    constructor() {
        super();
        this._unsubs    = [];
        this._listCache = new Map();
    }

    connectedCallback() {
        wake(this, rootContext(this));
    }

    disconnectedCallback() {
        if (this._disconnectQueued) return;
        this._disconnectQueued = true;
        queueMicrotask(() => {
            this._disconnectQueued = false;
            if (this.isConnected) return;
            unwake(this);
            this._component?.destroy();
            this._component = undefined;
            this._parentContext = undefined;
            this._loadedSrc = undefined;
            this._loadingSrc = undefined;
        });
    }
}

const projectedProps = (wrapper: Wrapper, url: URL): ComponentProps => {
    const parentCtx = wrapper._parentContext;
    const props: Record<string, () => unknown> = {};
    if (!parentCtx) return Object.freeze(props);

    for (const [propName, value] of url.searchParams) {
        const sourceName = value || propName;
        if (!isBareBindingPath(sourceName)) {
            throw new Error(
                `Unable to resolve prop "${propName}" for ${url.href}: ` +
                `parent binding "${sourceName}" is not a bare binding name`
            );
        }

        const source = resolveSource(parentCtx, sourceName, false, sourceName);
        if (!source) {
            throw new Error(
                `Unable to resolve prop "${propName}" for ${url.href}: ` +
                `parent binding "${sourceName}" was not found`
            );
        }
        props[propName] = source.read;
    }

    return Object.freeze(props);
};

export const load = async (wrapper: Wrapper, src: string) => {
    if (wrapper._loadedSrc === src || wrapper._loadingSrc === src) return;
    wrapper._loadingSrc = src;

    const url  = new URL(src, document.baseURI);
    try {
        const props = projectedProps(wrapper, url);
        const res  = await fetch(url);
        const html = await res.text();
        const tpl  = document.createElement('template');
        tpl.innerHTML = html;

        const scripts = tpl.content.querySelectorAll<HTMLScriptElement>(
            'script[type="module"][data-component]'
        );
        if (scripts.length > 1) {
            throw new Error(`Component view ${url.href} may contain only one data-component module`);
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
        wrapper._component = componentModule || Object.keys(props).length
            ? new ComponentRuntime(wrapper, componentModule ?? {}, instance, props)
            : undefined;
        wrapper._loadedSrc = src;
        wake(wrapper, rootContext(wrapper));
    } finally {
        if (wrapper._loadingSrc === src) wrapper._loadingSrc = undefined;
    }
};

setWrapperLoader((wrapper, src) => {
    load(wrapper, src).catch(err => console.error(`<data-wrapper src="${src}">`, err));
});

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
}
