import { wake, unwake, type ListCache, type Wrapper } from './engine.ts';
import {
    ComponentRuntime,
    type ComponentInstance,
    type ComponentModule,
} from './component.ts';
import type { Off } from './utils.ts';

type ComponentModuleRecord = {
    viewURL: string;
    module:  Promise<ComponentModule>;
};

const componentModules = new Map<string, ComponentModuleRecord>();

const importComponent = (
    script: HTMLScriptElement,
    viewURL: URL,
): Promise<ComponentModule> => {
    const name = script.dataset.module?.trim();
    if (!name) {
        throw new Error(`Component module ${viewURL.href} requires a data-module name`);
    }

    const existing = componentModules.get(name);
    if (existing) {
        if (existing.viewURL !== viewURL.href) {
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

    const module = import(name) as Promise<ComponentModule>;
    componentModules.set(name, { viewURL: viewURL.href, module });
    return module;
};

export class DataWrapper extends HTMLElement {
    declare _unsubs:     Off[];
    declare _listCache:  ListCache;
    declare _component?: ComponentRuntime;

    constructor() {
        super();
        this._unsubs    = [];
        this._listCache = new Map();
    }

    connectedCallback() {
        const src = this.getAttribute('src');
        if (src) load(this, src).catch(err => console.error(`<data-wrapper src="${src}">`, err));
        else wake(this);
    }

    disconnectedCallback() {
        unwake(this);
        this._component?.destroy();
        this._component = undefined;
    }
}

export const load = async (wrapper: Wrapper, src: string) => {
    const url  = new URL(src, document.baseURI);
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
    if (script) {
        script.remove();
        componentModule = await importComponent(script, url);
        const factory = componentModule.default;
        if (factory !== undefined) {
            if (typeof factory !== 'function') {
                throw new Error(`Component module ${url.href} default export must be a factory function`);
            }
            const created = factory(wrapper);
            if (created != null && typeof created !== 'object') {
                throw new Error(`Component module ${url.href} factory must return an object or nothing`);
            }
            instance = created as ComponentInstance | undefined;
        }
    }

    unwake(wrapper);
    wrapper._component?.destroy();
    wrapper.innerHTML = '';
    wrapper.append(tpl.content);
    wrapper._unsubs    = [];
    wrapper._listCache = new Map();
    wrapper._component = componentModule
        ? new ComponentRuntime(wrapper, componentModule, instance)
        : undefined;
    wake(wrapper);
};

if (typeof customElements !== 'undefined' && !customElements.get('data-wrapper')) {
    customElements.define('data-wrapper', DataWrapper);
}
