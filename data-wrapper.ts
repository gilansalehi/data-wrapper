//#region UTILITIES
const noop = () => { };
const idop = a => a;
export const q = (s, ctx = document) => [...ctx.querySelectorAll(s)];
export const qcb = (s, cb = idop, ctx = document) => q(s, ctx).map(cb);

export const emit = (eventName, payload, ctx = document) => {
    ctx.dispatchEvent(new CustomEvent(eventName, { detail: payload, bubbles: true }));
};

export const on = (eventName, cb, delegate = '', ctx = document) => {
    const handler = delegate
        ? event => {
            event.delegateTarget = event.target.closest(delegate);
            if (event.delegateTarget) cb(event);
        }
        : cb

    ctx.addEventListener(eventName, handler);
    return () => ctx.removeEventListener(eventName, handler);
};
//#endregion

//#region REGISTRY
export const CONFIG = Object.assign({
    TOKENS: { BIND: '$', ADD: '_', EVT: '@' },
    NO_WAKE: ['DATA-WRAPPER', 'TEMPLATE', 'SVG'],
}, window.VP_CUSTOM_CONFIG || {});

export const VP_TEMPLATES = new Map();

export const VP_FORMATTERS = new Map([
    ['count', v => (Array.isArray(v) || typeof v === 'string') ? v.length : 0],
    ['fallback', v => v ?? '—'],
    ['json', v => JSON.stringify(v, null, 2)],
    ['upper', v => String(v || '').toUpperCase()],
    ['lower', v => String(v || '').toLowerCase()],
    ['currency', v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0)],
    ['date', v => v ? new Date(v).toLocaleDateString() : ''],
    ['trim', v => String(v || '').trim()],
    ['bool', v => !!v]
]);

export const PROP_ALIASES = {
    // Framework Shorthand
    text: 'textContent',
    html: 'innerHTML',
    class: 'className',
    // HTML/JS Naming Discrepancies
    for: 'htmlFor',
    readonly: 'readOnly',
    tabindex: 'tabIndex',
    maxlength: 'maxLength',
    minlength: 'minLength',
    contenteditable: 'contentEditable',
    crossorigin: 'crossOrigin',
};
export const resolveAlias = (key) => PROP_ALIASES[key] || key;

export const sync = (el, prop, val) => {
    const alias = resolveAlias(prop);
    if (alias in el) {
        el[alias] = val;
    } else {
        el.setAttribute(alias, val)
    }
};
//#endregion

//#region ENGINE & RECONCILER
export const applyPipes = (rawValue, pipes) => {
    if (!pipes || pipes.length === 0) return rawValue ?? '';
    return pipes.reduce((acc, p) => (VP_FORMATTERS.get(p) ? VP_FORMATTERS.get(p)(acc) : acc), rawValue) ?? '';
};

export const syncClass = (el, val, type) => {
    if (el._vBase === undefined) el._vBase = new Set(el.classList);
    el._vState = el._vState || { dynamic: '', additive: '' };
    el._vState[type] = val || '';
    el.className = (Array.from(el._vBase).join(' ') + ` ${el._vState.dynamic} ${el._vState.additive}`).replace(/\s+/g, ' ').trim();
};

export const reconcile = (container, data, cache, tpl, hydrate) => {
    // 1. Handle Empty State
    if (!data || data.length === 0) {
        cache.forEach(node => node.remove());
        cache.clear();

        if (!container._vEmptyNode) {
            const emptyName = container.getAttribute('data-empty') || 'vp-empty';
            const emptyTpl = VP_TEMPLATES.get(emptyName);

            if (emptyTpl) {
                container._vEmptyNode = emptyTpl.content.cloneNode(true).firstElementChild;
            } else {
                // Buffer Registry fallback if no template is provided
                const temp = document.createElement('template');
                temp.innerHTML = CONFIG.FALLBACKS.EMPTY;
                container._vEmptyNode = temp.content.firstElementChild;
            }
            container.appendChild(container._vEmptyNode);
        }
        return;
    }

    // 2. Clear Empty State
    if (container._vEmptyNode) {
        container._vEmptyNode.remove();
        container._vEmptyNode = null;
    }

    const activeIds = new Set();
    const fragment = document.createDocumentFragment();

    // 3. Diff and Mutate
    data.forEach(item => {
        const id = item.id ?? JSON.stringify(item);
        activeIds.add(id);

        let node = cache.get(id);
        let isNew = false;

        if (!node) {
            node = tpl.content.cloneNode(true).firstElementChild;
            cache.set(id, node);
            isNew = true;
        }

        node._vItem = item; // Refresh context for active bindings
        if (isNew) hydrate(node, node);

        fragment.appendChild(node);
    });

    // 4. Cleanup Stale Nodes
    cache.forEach((node, id) => {
        if (!activeIds.has(id)) { node.remove(); cache.delete(id); }
    });

    container.appendChild(fragment);
};
//#endregion

//#region HYDRATION
export const update = (wrapper, config, manualVal) => {
    const { el, path, prop, pipes, itemNode } = config;
    if (!el.isConnected) return false;

    // Resolve: Manual > Scoped > Global
    let val = manualVal !== undefined
        ? manualVal
        : (itemNode?._vItem?.[path] ?? wrapper.state[path]);

    // Transform
    for (let i = 0; i < pipes.length; i++) {
        val = pipes[i](val);
    }

    sync(el, prop, val);
    return true;
};
/**
 * SUBSCRIBE: Data Handshake
 * Configures the "Sniper" object for $ or _ tokens.
 */
export const subscribe = (el, mode, attrName, attrValue, itemNode = null) => {
    const wrapper = el.closest('data-wrapper');
    if (!wrapper) return;

    const prefix = mode === 'dynamic' ? CONFIG.TOKENS.BIND : CONFIG.TOKENS.ADD;
    const [path, ...pipeNames] = attrValue.split('|').map(s => s.trim());

    const config = {
        el,
        path,
        prop: attrName.slice(prefix.length),
        pipes: pipeNames.map(name => VP_FORMATTERS.get(name)).filter(Boolean),
        itemNode
    };

    wrapper.register(path, config);
};

export const wakeElement = (el, itemNode = null) => {
    if (el._vWoke) return;
    el._vWoke = true;

    const wrapper = el.closest('data-wrapper');
    if (!wrapper) return;

    const { BIND, ADD, EVT } = CONFIG.TOKENS;

    [...el.attributes].forEach(attr => {
        const { name, value } = attr;

        // DOWNWARD DATA (Fine-grained Sniper)
        if (name.startsWith(BIND)) subscribe(el, 'dynamic', name, value, itemNode);
        else if (name.startsWith(ADD)) subscribe(el, 'additive', name, value, itemNode);

        // UPWARD EVENTS (Delegated Messaging)
        else if (name.startsWith(EVT)) {
            const eventName = name.slice(EVT.length);

            // Handshake: Emit a message when the event fires
            wrapper.on(eventName, (e) => {
                const topic = e.delegateTarget.getAttribute(name);
                const detail = itemNode ? { item: itemNode._vItem, event: e } : e;
                wrapper.emit(topic, detail);
            }, `[${name}]`);
        }
    });
};

export const wakeTree = (root, wrapper, itemNode = null) => {
    const { SHOW_ELEMENT, FILTER_ACCEPT, FILTER_REJECT } = NodeFilter;

    const walker = document.createTreeWalker(root, SHOW_ELEMENT, {
        acceptNode: n => CONFIG.NO_WAKE.includes(n.tagName)
            ? FILTER_REJECT
            : FILTER_ACCEPT
    });

    wakeElement(root, wrapper, itemNode);
    let el;
    while (el = walker.nextNode()) wakeElement(el, wrapper, itemNode);
}
//#endregion

//#region COMPONENT
export class DataWrapper extends HTMLElement {
    //#region setup
    constructor() {
        super();
        const self = this;

        // Framework Registry & Sync Lock
        self.subs = {};
        self._isSyncing = false;

        self.state = new Proxy(self.dataset, {
            set: function (target, key, value) {
                const serialized = (value && typeof value === 'object')
                    ? JSON.stringify(value)
                    : value;

                // Avoid redundant DOM writes if value hasn't changed
                if (target[key] === String(serialized)) return true;

                self._isSyncing = true;
                target[key] = serialized;

                // Notify subtree of JS-driven update
                if (self._notify) self._notify(key, value);

                queueMicrotask(function () {
                    self._isSyncing = false;
                });
                return true;
            },

            get: function (target, key) {
                const val = target[key];
                try {
                    return JSON.parse(val);
                } catch (e) {
                    return val;
                }
            }
        });

        self.observer = new MutationObserver(function (mutations) {
            if (self._isSyncing) return;

            for (let i = 0; i < mutations.length; i++) {
                const attr = mutations[i].attributeName;

                if (attr.indexOf('data-') === 0) {
                    // Manual kebab-to-camel to match dataset keys
                    const prop = attr.slice(5).replace(/-./g, function (match) {
                        return match[1].toUpperCase();
                    });

                    // Notify subtree using the Proxy's enhanced (parsed) value
                    if (self._notify) self._notify(prop, self.state[prop]);
                }
            }
        });
    }

    connectedCallback() {
        const self = this;

        // 1. Start watching the host for attribute changes
        self.observer.observe(self, { attributes: true });

        // 2. Wake the subtree (Scanning tokens & building subscriptions)
        wakeTree(self, self);

        // 3. Initial Sync
        // Iterate through existing dataset keys to hydrate the
        // newly created bindings with the data present at mount time.
        Object.keys(self.dataset).forEach(function (key) {
            if (self._notify) {
                self._notify(key, self.state[key]);
            }
        });

        // 4. Lifecycle Signal
        emit('data-wrapper:load', self)
    }
    // #endregion setup

    _resolve(path, globalVal, currentItem) {
        if (currentItem && currentItem[path] !== undefined) return currentItem[path];
        if (path.startsWith('~')) return globalVal;

        let target = this;
        const parts = path.split('/');
        const key = parts.pop();
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '..' && target.parent) target = target.parent;
        }
        return target.state.get(key) ?? globalVal;
    }

    _bind(el, prop, topic, itemNode, mode) {
        const parts = topic.split('|').map(s => s.trim());

        const update = (gVal) => {
            const dataTarget = itemNode ? itemNode._vItem : null;
            const val = applyPipes(this._resolve(parts[0], gVal, dataTarget), parts.slice(1));

            if (prop === 'list') {
                let cache = this._listCache.get(el) || this._listCache.set(el, new Map()).get(el);
                reconcile(el, val, cache, el.querySelector('template'), (n, iNode) => this._hydrate(n, iNode));
            }
            else if (prop === 'text') el.textContent = val;
            else if (prop === 'class') syncClass(el, val, mode);
            else if (prop in el) el[prop] = val;
            else el.setAttribute(prop, val);
        };

        if (parts[0].startsWith('~')) {
            this._unsubs.push(sub(parts[0].slice(1), update));
        } else {
            this._unsubs.push(on(this, 'data:sync', e => {
                if (itemNode || e.detail.key === parts[0]) update();
            }));
            update();
        }
    }

    _listen(el, evt, topic, itemNode) {
        // Leverages our upgraded 'on' utility for a very clean listener attachment
        this._unsubs.push(on(el, evt, e => {
            if (itemNode) e.item = itemNode._vItem;
            emit(topic, e);
        }));
    }

    _hydrate(...args) { return wakeTree(...args) }

    register(path, updater) {
        this.subs[path] = this.subs[path] || [];
        this.subs[path].push(updater);

        updater();
    }

    // --- State Mutation API --- //
    // Native implementation of the DWRL Resolver
    parseDWRL(input, base) {
        // We use "hdwp://" to trigger URI logic
        const url = new URL(input, base || "hdwp://localhost/");

        return {
            authority: url.host,
            segments: url.pathname.split('/').filter(Boolean),
            property: url.hash.slice(1),
            params: Object.fromEntries(url.searchParams)
        };
    }

    /**
     * Parses a raw framework string into a standardized DWRL Request Object.
     * @param {String} rawString - e.g., "PUT //app.local/theme | not"
     * @param {String} baseUrl - e.g., "data://app.data/todos/2/"
     */
    // export const parseDWRL = (rawString, baseUrl) => {
    parseDWRL2(rawString, baseUrl) {
        // 1. Extract optional HTTP Verb (Defaults to PUT for writing, GET for reading)
        const verbMatch = rawString.trim().match(/^(PUT|POST|DELETE|PATCH|GET)?\s*(.*)$/i);
        const verb = (verbMatch[1] || 'GET').toUpperCase(); // Implicit Read
        const urlString = verbMatch[2];

        // 2. Extract pipes (Split by |)
        const [pathString, ...rawPipes] = urlString.split('|');

        // 3. THE METAL PARSER: Let the browser resolve the absolute address
        const url = new URL(pathString.trim(), baseUrl);

        // 4. Map the Authority (host.tld -> wrapperId.storageEngine)
        const [host, storageEngine, ...etc] = url.hostname.split('.');

        // 5. The Interpreter Output
        return {
            verb: verb,                            // 'PUT', 'GET', etc.
            scheme: url.protocol.replace(':', ''), // 'data', 'rpc', 'api'
            host: host,                             // 'app' (The authority component)
            storage: storageEngine || 'data',       // 'data', 'local', 'session'
            path: url.pathname,                    // '/ui/modalOpen'
            hash: url.hash.slice(1),               // 'isOpen' (If using a fragment hinge)
            query: url.searchParams,               // Native URLSearchParams object
            pipes: rawPipes.map(p => p.trim()),    // ['not']
            absoluteAddress: url.href              // The literal canonical URL
        };
    };

    // A "GET" request on the DWRL Server
    // const resolveDWRL = (dwrl, wrapper) => {
    get(dwrl, wrapper) {
        const { path, fragment } = parseDWRL(dwrl);
        // path = "users/0", fragment = "name"

        let target = wrapper.state[path[0]]; // Initial dataset lookup
        for (let i = 1; i < path.length; i++) target = target[path[i]]; // Drill

        return target[fragment]; // The final anchor
    }

    put(key, val) {
        const next = typeof val === 'function' ? val(this.state.get(key)) : val;
        if (this.state.get(key) === next) return;

        this.state.set(key, next);
        if (typeof next !== 'object') this.setAttribute(`data-${key}`, next);
        this.dispatchEvent(new CustomEvent('data:sync', { detail: { key } }));
    }

    patch(key, obj) {
        this.put(key, { ...(this.state.get(key) || {}), ...obj });
    }

    push(key, item) {
        this.put(key, [...(this.state.get(key) || []), item]);
    }

    pull(key, predicate) {
        const current = this.state.get(key) || [];
        const fn = typeof predicate === 'function' ? predicate : (i) => i.id !== predicate;
        this.put(key, current.filter(fn));
    }

    disconnectedCallback() {
        this.obs?.disconnect();
        [...this._unsubs].forEach(un => un());
    }
}
//#endregion

/**
 * The Bridge: Converts a standalone utility into a class method.
 * It ensures 'this' (the DataWrapper instance) is passed as the last argument.
 */
const bridge = (fn) => function (...args) {
    return fn(...args, this);
};

// The Bundle: Define which utilities we want on the element
const contextKit = { q, qcb, on, emit };

// The Decoration: Apply them to the Prototype
Object.entries(contextKit).forEach(([name, fn]) => {
    DataWrapper.prototype[name] = bridge(fn);
});

customElements.define('data-wrapper', DataWrapper);
