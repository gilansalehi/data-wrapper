// src/lib/utils.ts
var DWRL_BASE = "dwrl://data-wrapper/";
var pURL = (raw) => {
  let parent = 0;
  let input = raw;
  while (input.startsWith("../")) {
    parent += 1;
    input = input.slice(3);
  }
  let isRel = input.startsWith("./");
  const url = new URL(input.slice(isRel ? 1 : 0), DWRL_BASE);
  let path = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
  if (path.startsWith("./")) {
    isRel = true;
    path = path.slice(2);
  }
  return { path, isRel, parent, params: url.searchParams, host: url.hostname, protocol: url.protocol };
};
var p = pURL;
var readPath = (obj, path) => !path ? obj : path.split("/").reduce((acc, k) => acc == null ? undefined : acc[k], obj);
var q = (s, ctx = document) => [...ctx.querySelectorAll(s)];
var emit = (name, detail, ctx = document) => ctx.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
var on = (name, cb, ctx = document) => {
  ctx.addEventListener(name, cb);
  return () => ctx.removeEventListener(name, cb);
};
var cloneTemplate = (tpl) => tpl.content.cloneNode(true).firstElementChild;

// src/lib/engine.ts
var rootContext = (wrapper) => ({ wrapper, scope: wrapper._component ?? null, parent: null, unsubs: wrapper._unsubs });
var childContext = (parent, row) => ({ wrapper: parent.wrapper, scope: rowScope(row), parent, unsubs: row.unsubs });
var blockContext = (parent, unsubs) => ({ wrapper: parent.wrapper, scope: null, parent, unsubs });
var nearestItemScope = (ctx) => {
  for (let c = ctx;c; c = c.parent)
    if (c.scope?.item)
      return c.scope;
  return null;
};
var parentItemScope = (ctx, levels) => {
  for (let c = ctx;c; c = c.parent) {
    if (!c.scope?.item)
      continue;
    if (levels === 0)
      return c.scope;
    levels -= 1;
  }
  return null;
};
var rootScope = (ctx) => {
  let root = ctx;
  while (root.parent)
    root = root.parent;
  return root.scope;
};
var nearestItem = (ctx) => nearestItemScope(ctx)?.item?.();
var ownerUnsubs = (ctx) => ctx.unsubs;
var own = (ctx, off) => {
  ownerUnsubs(ctx).push(off);
};
var subscribe = (st, ch, sub, value) => {
  const subs = st[ch] ??= [];
  subs.push(sub);
  sub(value);
  return () => {
    const i = subs.indexOf(sub);
    if (i !== -1)
      subs.splice(i, 1);
  };
};
var publish = (st, ch, value) => {
  for (const sub of [...st[ch] ?? []])
    sub(value);
};
var unwire = (offs) => {
  for (const off of offs)
    off();
  offs.length = 0;
};
var unwake = (wrapper) => {
  for (const cache of wrapper._listCache.values())
    for (const row of cache.values())
      unwire(row.unsubs);
  unwire(wrapper._unsubs);
};
var DW_DIRECTIVES = new Map;
var text = (value) => value == null ? "" : String(value);
var numberValue = (value) => {
  if (value == null || value === "")
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
var dateValue = (value) => {
  if (value == null || value === "")
    return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
var fixedDigits = (arg, fallback = 2) => {
  const n = Number.parseInt(String(arg ?? ""), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : fallback;
};
var boolLabel = (value, arg, yes, no) => {
  const labels = arg == null || arg === "" ? [yes, no] : String(arg).split(":");
  return value ? labels[0] : labels[1] ?? "";
};
var caseText = (value, arg) => {
  const s = text(value);
  switch (String(arg ?? "").toLowerCase()) {
    case "upper":
      return s.toUpperCase();
    case "lower":
      return s.toLowerCase();
    case "title":
      return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    case "sentence":
      return s ? s[0].toUpperCase() + s.slice(1) : s;
    default:
      return s;
  }
};
var truncateText = (value, arg) => {
  const s = text(value);
  const n = Number.parseInt(String(arg ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0 || s.length <= n)
    return s;
  return n <= 3 ? s.slice(0, n) : `${s.slice(0, n - 3)}...`;
};
var countValue = (value, arg) => {
  if (value == null)
    return 0;
  if (arg === "words")
    return text(value).trim().split(/\s+/).filter(Boolean).length;
  if (arg === "chars")
    return text(value).length;
  return typeof value.length === "number" ? value.length : 0;
};
var sortValue = (value, arg) => {
  if (!Array.isArray(value))
    return value;
  let key = String(arg ?? "").trim();
  let desc = false;
  if (key.startsWith("-")) {
    desc = true;
    key = key.slice(1);
  }
  const colon = key.indexOf(":");
  if (colon !== -1) {
    desc = key.slice(colon + 1).toLowerCase() === "desc";
    key = key.slice(0, colon);
  }
  const read = (item) => key ? readPath(item, key) : item;
  return [...value].sort((a, b) => {
    const av = read(a);
    const bv = read(b);
    if (av == null && bv == null)
      return 0;
    if (av == null)
      return 1;
    if (bv == null)
      return -1;
    const order = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return desc ? -order : order;
  });
};
var uniqueValue = (value, arg) => {
  if (!Array.isArray(value))
    return value;
  const key = String(arg ?? "");
  const seen = new Set;
  return value.filter((item) => {
    const id = key ? readPath(item, key) : item;
    if (seen.has(id))
      return false;
    seen.add(id);
    return true;
  });
};
var DW_FORMATTERS = new Map([
  ["bool", (v, arg) => boolLabel(v, arg, "true", "false")],
  ["default", (v, arg) => v == null || v === "" ? text(arg) : v],
  ["case", caseText],
  ["trim", (v) => text(v).trim()],
  ["truncate", truncateText],
  ["count", countValue],
  ["join", (v, arg) => Array.isArray(v) ? v.join(arg === "" || arg == null ? ", " : String(arg)) : text(v)],
  ["sort", sortValue],
  ["unique", uniqueValue],
  ["number", (v) => {
    const n = numberValue(v);
    return n == null ? "" : new Intl.NumberFormat("en-US").format(n);
  }],
  ["fixed", (v, arg) => {
    const n = numberValue(v);
    return n == null ? "" : n.toFixed(fixedDigits(arg));
  }],
  ["percent", (v, arg) => {
    const n = numberValue(v);
    return n == null ? "" : new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: fixedDigits(arg, 0)
    }).format(n);
  }],
  ["currency", (v, arg) => {
    const n = numberValue(v);
    if (n == null)
      return "";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: String(arg || "USD").toUpperCase()
      }).format(n);
    } catch {
      return "";
    }
  }],
  ["date", (v) => dateValue(v)?.toLocaleDateString("en-US") ?? ""],
  ["time", (v) => dateValue(v)?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? ""],
  ["datetime", (v) => dateValue(v)?.toLocaleString("en-US") ?? ""],
  ["json", (v) => {
    try {
      return JSON.stringify(v) ?? "";
    } catch {
      return text(v);
    }
  }]
]);
var PROP_ALIASES = {
  text: "textContent",
  class: "className",
  unsafeHTML: "innerHTML",
  unsafehtml: "innerHTML"
};
var URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "data",
  "ping",
  "poster",
  "background"
]);
var CONTROL_CHARS = /[\u0000-\u0020]+/g;
var DANGEROUS_URL = /^(?:javascript|vbscript):/i;
var isDangerousUrl = (val) => DANGEROUS_URL.test(String(val).replace(CONTROL_CHARS, ""));
var setProp = (el, prop, val) => {
  if (val == null)
    val = "";
  if (URL_ATTRS.has(prop.toLowerCase()) && isDangerousUrl(val)) {
    console.warn(`data-wrapper: blocked unsafe URL scheme in ${prop}="${String(val)}"`);
    return;
  }
  const value = prop === "textContent" ? String(val) : val;
  if (prop in el)
    el[prop] = value;
  else
    el.setAttribute(prop, String(val));
};
var bind = (el, prop) => {
  const lower = prop.toLowerCase();
  if (lower === "innerhtml" || lower === "outerhtml") {
    throw new Error(`$${prop} is blocked: binding raw HTML is an XSS risk. Use $text for ` + `safe text, or $unsafeHTML to opt into raw HTML when you trust the value.`);
  }
  if (lower.length > 2 && lower.startsWith("on")) {
    throw new Error(`$${prop} is blocked: bind events with @${lower.slice(2)} (the @event ` + `interface), not a $ property binding.`);
  }
  if (prop === "class") {
    const base = el.className;
    return (v) => {
      if (v == null)
        return;
      setProp(el, "className", (base + " " + String(v)).replace(/\s+/g, " ").trim());
    };
  }
  const alias = PROP_ALIASES[prop] || prop;
  return (v) => setProp(el, alias, v);
};
var TOKENS = "@$*";
var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
var LIVE = "_live";
var BARE_PATH = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\/[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;
var BARE_BINDING = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\/[a-zA-Z_$][a-zA-Z0-9_$]*)*(?:[?#].*)?$/;
var DWRL_PROTOCOL = "dwrl:";
var formatter = (params) => {
  const steps = [];
  for (const [k, v] of params) {
    if (k === "key" || k === "prevent" || k === "stop" || k === "immediate")
      continue;
    const fn = DW_FORMATTERS.get(k);
    if (fn)
      steps.push((x) => fn(x, v));
  }
  return (value) => steps.reduce((v, step) => step(v), value);
};
var rowSource = (row, path) => ({
  read: () => readPath(row.item, path),
  subscribe: (cb) => subscribe(row.subs, path, cb, readPath(row.item, path))
});
var firstPathSegment = (path) => path.split("/")[0] ?? "";
var hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
var isCrossWrapperBinding = (raw) => raw.startsWith("//");
var isRootBinding = (raw) => raw.startsWith("/") && !isCrossWrapperBinding(raw);
var isReservedProtocol = (protocol) => protocol !== DWRL_PROTOCOL;
var rowScope = (row) => ({
  source: (path) => hasOwn(row.item, firstPathSegment(path)) ? rowSource(row, path) : null,
  item: () => row.item
});
var resolveSource = (ctx, path, isRel, parent = 0, raw, host = "") => {
  if (!BARE_PATH.test(path))
    return null;
  if (raw !== undefined && isCrossWrapperBinding(raw)) {
    const target = ctx.wrapper.ownerDocument.getElementById(host);
    if (!target?.matches("data-wrapper"))
      return null;
    return target._component?.source(path) ?? null;
  }
  if (raw !== undefined && isRootBinding(raw))
    return rootScope(ctx)?.source(path) ?? null;
  if (parent > 0)
    return parentItemScope(ctx, parent)?.source(path) ?? null;
  if (isRel)
    return nearestItemScope(ctx)?.source(path) ?? null;
  if (raw !== undefined && !BARE_BINDING.test(raw))
    return null;
  for (let c = ctx;c; c = c.parent) {
    const source = c.scope?.source(path);
    if (source)
      return source;
  }
  return null;
};
var staticSource = (value) => ({
  read: () => value,
  subscribe: (cb) => {
    cb(value);
    return () => {};
  }
});
var canFallbackToStatic = (raw, path, parent) => BARE_BINDING.test(raw) || raw.startsWith("./") && BARE_PATH.test(path) || parent > 0 && BARE_PATH.test(path);
var resolveBinding = (ctx, path, isRel, parent, raw, host) => {
  const source = resolveSource(ctx, path, isRel, parent, raw, host);
  if (source)
    return { source, missed: false };
  if (isCrossWrapperBinding(raw)) {
    console.warn(`data-wrapper: unresolved cross-wrapper binding "${raw}"`);
    return { source: null, missed: false };
  }
  if (!canFallbackToStatic(raw, path, parent))
    return { source: null, missed: false };
  return { source: staticSource(path), missed: true };
};
var warnStaticFallback = (value) => {
  console.warn(`data-wrapper: unresolved binding "${value}" rendered as a static literal`);
};
var wire = (el, attr, ctx, load) => {
  const { name, value } = attr;
  const token = name[0];
  const prop = name.slice(1);
  const dwrl = p(value);
  const { path, isRel, parent, params, host, protocol } = dwrl;
  const wrapper = ctx.wrapper;
  if (isReservedProtocol(protocol))
    return;
  if (token === "@") {
    if (!path)
      return;
    const off = on(prop, (e) => {
      if (e instanceof CustomEvent && e.type === path)
        return;
      if (params.has("prevent"))
        e.preventDefault();
      if (params.has("stop"))
        e.stopPropagation();
      if (params.has("immediate"))
        e.stopImmediatePropagation();
      const detail = { originalEvent: e, path, isRel, item: nearestItem(ctx) };
      emit(path, detail, el);
    }, el);
    own(ctx, off);
    if (BARE_BINDING.test(value) || isRootBinding(value)) {
      const actionOff = wrapper._component?.activateAction(path);
      if (actionOff)
        own(ctx, actionOff);
    }
    return;
  }
  const { source, missed } = resolveBinding(ctx, path, isRel, parent, value, host);
  if (!source)
    return;
  if (missed)
    warnStaticFallback(value);
  const format = formatter(params);
  if (token === "$") {
    const set = bind(el, prop);
    const off = source.subscribe((v) => set(format(v)));
    own(ctx, off);
    return;
  }
  if (token === "*") {
    const factory = DW_DIRECTIVES.get(prop);
    if (!factory)
      throw new Error(`Unknown directive *${prop}`);
    const updater = factory({
      ...dwrl,
      ctx,
      el,
      wake: (node, nextCtx) => wake(node, nextCtx, load),
      cleanup: (off2) => own(ctx, off2)
    });
    const off = source.subscribe((v) => updater(format(v)));
    own(ctx, off);
    return;
  }
};
var wakeNodes = (root) => {
  const nodes = [root];
  const visit = (node) => {
    for (const child of [...node.children]) {
      if (child.namespaceURI === SVG_NAMESPACE)
        continue;
      nodes.push(child);
      if (child.tagName === "DATA-WRAPPER")
        continue;
      visit(child);
    }
  };
  visit(root);
  return nodes;
};
var loadChildWrapper = (el, ctx, load) => {
  if (!load)
    return;
  const src = el.getAttribute("src");
  if (!src)
    return;
  const wrapper = el;
  if (wrapper._loadedSrc === src)
    return;
  Promise.resolve(load(wrapper, src, ctx)).catch((err) => {
    throw new Error(`<data-wrapper src="${src}"> failed to load`, { cause: err });
  });
};
var wake = (root, ctx, load) => {
  for (const el of wakeNodes(root)) {
    const isChildWrapper = el !== ctx.wrapper && el.tagName === "DATA-WRAPPER";
    if (el.hasAttribute(LIVE))
      continue;
    const attrs = [...el.attributes].filter((a) => TOKENS.includes(a.name[0]));
    if (attrs.length) {
      el.setAttribute(LIVE, "");
      for (const a of attrs)
        wire(el, a, ctx, load);
    }
    if (isChildWrapper)
      loadChildWrapper(el, ctx, load);
  }
};
var reconcile = (container, data, cache, tpl, keyProp, ctx, wakeNode) => {
  const active = new Set;
  const fresh = [];
  let cursor = tpl.nextSibling;
  for (const item of data) {
    const id = item[keyProp] ?? JSON.stringify(item);
    active.add(id);
    let row = cache.get(id);
    if (!row) {
      const node = cloneTemplate(tpl);
      node.setAttribute("_key", String(id));
      row = { node, item, subs: {}, unsubs: [] };
      cache.set(id, row);
      fresh.push(row);
    } else {
      row.item = item;
      for (const ch in row.subs)
        publish(row.subs, ch, readPath(item, ch));
    }
    if (row.node.parentNode !== container || row.node !== cursor && row.node.nextSibling !== cursor)
      container.insertBefore(row.node, cursor);
    cursor = row.node.nextSibling;
  }
  for (const [id, row] of cache) {
    if (active.has(id))
      continue;
    unwire(row.unsubs);
    row.node.remove();
    cache.delete(id);
  }
  for (const row of fresh)
    wakeNode(row.node, childContext(ctx, row));
};
var listDirective = ({ ctx, el, params, wake: wake2, cleanup }) => {
  const tpl = el;
  const container = tpl.parentElement;
  if (!container)
    return () => {};
  const wrapper = ctx.wrapper;
  let cache = wrapper._listCache.get(container);
  if (!cache) {
    cache = new Map;
    wrapper._listCache.set(container, cache);
  }
  cleanup(() => {
    for (const row of cache.values()) {
      unwire(row.unsubs);
      row.node.remove();
    }
    cache.clear();
    wrapper._listCache.delete(container);
  });
  const keyProp = params.get("key") || "id";
  return (value) => {
    const items = Array.isArray(value) ? value : [];
    if (items.length === 0) {
      for (const row of cache.values()) {
        unwire(row.unsubs);
        row.node.remove();
      }
      cache.clear();
      return;
    }
    reconcile(container, items, cache, tpl, keyProp, ctx, wake2);
  };
};
var ifDirective = ({ ctx, el, wake: wake2, cleanup }) => {
  const tpl = el;
  const anchor = document.createComment("dw-if");
  tpl.replaceWith(anchor);
  let live = null;
  let liveUnsubs = [];
  const disposeLive = () => {
    unwire(liveUnsubs);
    live?.remove();
    live = null;
    liveUnsubs = [];
  };
  cleanup(disposeLive);
  return (value) => {
    if (value && !live) {
      live = cloneTemplate(tpl);
      if (!live)
        return;
      liveUnsubs = [];
      anchor.parentNode.insertBefore(live, anchor);
      wake2(live, blockContext(ctx, liveUnsubs));
    } else if (!value && live) {
      disposeLive();
    }
  };
};
DW_DIRECTIVES.set("list", listDirective);
DW_DIRECTIVES.set("if", ifDirective);

// src/lib/component.ts
var own2 = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
var firstPathSegment2 = (path) => path.split("/")[0] ?? "";
var restPath = (path) => {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(i + 1);
};

class ComponentRuntime {
  static all = new Set;
  root;
  module;
  instance;
  station = {};
  outputs = new Map;
  actions = new Map;
  flushing = false;
  pending = false;
  constructor(root, module, instance) {
    this.root = root;
    this.module = module;
    this.instance = instance;
    ComponentRuntime.all.add(this);
  }
  has(name) {
    const key = firstPathSegment2(name);
    return this.hasInstance(key) || key !== "default" && own2(this.module, key);
  }
  source(name) {
    if (!this.has(name))
      return null;
    return {
      read: () => this.read(name),
      subscribe: (cb) => this.subscribe(name, cb)
    };
  }
  read(name) {
    return this.reader(name)();
  }
  subscribe(name, sub) {
    let output = this.outputs.get(name);
    if (!output) {
      const read = this.reader(name);
      output = { read, value: read() };
      this.outputs.set(name, output);
      if (this.flushing)
        this.pending = true;
    }
    const off = subscribe(this.station, name, sub, output.value);
    return () => {
      off();
      if (this.station[name]?.length === 0) {
        delete this.station[name];
        this.outputs.delete(name);
      }
    };
  }
  flush() {
    if (this.flushing) {
      this.pending = true;
      return;
    }
    this.flushing = true;
    try {
      do {
        this.pending = false;
        for (const [name, output] of [...this.outputs]) {
          if (this.outputs.get(name) !== output)
            continue;
          const value = output.read();
          if (Object.is(value, output.value))
            continue;
          output.value = value;
          publish(this.station, name, value);
        }
      } while (this.pending);
    } finally {
      this.flushing = false;
    }
  }
  activateAction(name) {
    const value = this.exactValue(name);
    if (typeof value !== "function")
      return null;
    let active = this.actions.get(name);
    if (!active) {
      const wrapped = action((...args) => {
        const current = this.exactValue(name);
        if (typeof current !== "function") {
          throw new Error(`Component action "${name}" is no longer a function`);
        }
        return current(...args);
      });
      const handler = (e) => {
        if (!(e instanceof CustomEvent))
          return;
        if (this.root.matches("data-wrapper") && e.target instanceof Element && e.target.closest("data-wrapper") !== this.root)
          return;
        wrapped(e);
      };
      active = { refs: 0, handler };
      this.actions.set(name, active);
      this.root.addEventListener(name, handler);
    }
    active.refs += 1;
    return () => {
      if (--active.refs > 0)
        return;
      this.root.removeEventListener(name, active.handler);
      this.actions.delete(name);
    };
  }
  destroy() {
    ComponentRuntime.all.delete(this);
    this.outputs.clear();
    for (const [name, a] of this.actions)
      this.root.removeEventListener(name, a.handler);
    this.actions.clear();
    for (const k in this.station)
      delete this.station[k];
  }
  hasInstance(name) {
    return !!this.instance && own2(this.instance, name);
  }
  exactValue(name) {
    return this.hasInstance(name) ? this.instance[name] : this.module[name];
  }
  value(name) {
    const key = firstPathSegment2(name);
    const rest = restPath(name);
    const v = this.exactValue(key);
    const base = typeof v === "function" ? v() : v;
    return rest ? readPath(base, rest) : base;
  }
  reader(name) {
    if (!this.has(name)) {
      throw new Error(`Component binding "${name}" is not exported`);
    }
    return () => {
      return this.value(name);
    };
  }
}
var flush = () => {
  for (const r of ComponentRuntime.all)
    r.flush();
};
var _scheduled = false;
var _scheduleFlush = () => {
  if (_scheduled)
    return;
  _scheduled = true;
  queueMicrotask(() => {
    _scheduled = false;
    flush();
  });
};
var ACTION = Symbol("dw:action");
function action(input) {
  if (typeof input === "function") {
    if (input[ACTION])
      return input;
    const wrapped = (...args) => {
      let result;
      try {
        result = input(...args);
      } finally {
        _scheduleFlush();
      }
      if (result instanceof Promise)
        result.finally(_scheduleFlush).catch(() => {});
      return result;
    };
    wrapped[ACTION] = true;
    return wrapped;
  }
  if (input && typeof input === "object") {
    const out = {};
    for (const k of Object.keys(input))
      out[k] = action(input[k]);
    return out;
  }
  throw new TypeError("action() expects a function or an object of functions");
}

// src/lib/element.ts
var componentModules = new Map;
var shimPromise;
var viewSourceOrigin = new URL(document.baseURI).origin;
var isTrustedViewSource = (url) => url.origin === viewSourceOrigin;
var canonicalViewURL = (url) => {
  const canonical = new URL(url);
  canonical.search = "";
  canonical.hash = "";
  return canonical.href;
};
var shimSource = () => document.querySelector("script[data-shim-src]")?.dataset.shimSrc;
var loadShim = () => {
  const global = globalThis;
  if (global.importShim)
    return Promise.resolve(global.importShim);
  if (shimPromise)
    return shimPromise;
  const src = shimSource();
  if (!src)
    return Promise.reject(new Error("No data-shim-src configured"));
  shimPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => global.importShim ? resolve(global.importShim) : reject(new Error(`Module shim ${src} did not expose importShim()`));
    script.onerror = () => reject(new Error(`Failed to load module shim ${src}`));
    document.head.append(script);
  });
  return shimPromise;
};
var isResolutionError = (error) => error instanceof TypeError && /bare specifier|resolve(?: module)? specifier|does not resolve to a valid URL/i.test(error.message);
var importMappedModule = async (name) => {
  const global = globalThis;
  if (global.importShim)
    return global.importShim(name);
  try {
    return await import(name);
  } catch (error) {
    if (!isResolutionError(error))
      throw error;
    if (shimSource())
      return (await loadShim())(name);
    throw new Error(`Could not resolve component module "${name}". Add es-module-shims with data-shim-src.`, { cause: error });
  }
};
var importComponent = (script, viewURL) => {
  const name = script.dataset.module?.trim();
  const owner = canonicalViewURL(viewURL);
  if (!name) {
    throw new Error(`Component module ${viewURL.href} requires a data-module name`);
  }
  const existing = componentModules.get(name);
  if (existing) {
    if (existing.viewURL !== owner) {
      throw new Error(`Duplicate data-module "${name}" in ${viewURL.href}; already registered by ${existing.viewURL}`);
    }
    return existing.module;
  }
  const srcAttr = script.getAttribute("src");
  const moduleURL = srcAttr ? new URL(srcAttr, viewURL.href).href : URL.createObjectURL(new Blob([
    `${script.textContent ?? ""}
//# sourceURL=${name}
`
  ], { type: "text/javascript" }));
  const importMap = document.createElement("script");
  importMap.type = "importmap";
  importMap.textContent = JSON.stringify({ imports: { [name]: moduleURL } });
  document.head.append(importMap);
  const module = importMappedModule(name);
  componentModules.set(name, { viewURL: owner, module });
  return module;
};
var isCrossWrapperInputExpression = (raw) => raw.startsWith("//");
var isReservedInputProtocol = (protocol) => protocol !== "dwrl:";
var resolveInputAssignment = (expr, ctx) => {
  if (ctx) {
    const { path, isRel, parent, host, protocol } = p(expr);
    if (isReservedInputProtocol(protocol))
      return null;
    const source = resolveSource(ctx, path, isRel, parent, expr, host);
    if (source)
      return () => source.read();
  }
  if (isCrossWrapperInputExpression(expr)) {
    console.warn(`data-wrapper: unresolved cross-wrapper input "${expr}"`);
    return null;
  }
  return expr;
};
var inputProps = (src, url, ctx) => {
  const props = Object.create(null);
  const seen = new Set;
  for (const [name, value] of url.searchParams) {
    if (seen.has(name))
      continue;
    seen.add(name);
    const expr = value === "" ? name : value;
    const assignment = resolveInputAssignment(expr, ctx);
    if (assignment == null)
      continue;
    props[name] = assignment;
  }
  props.url = src;
  return Object.freeze(props);
};
var isNestedWrapper = (wrapper) => !!wrapper.parentElement?.closest("data-wrapper");

class DataWrapper extends HTMLElement {
  _disconnectQueued = false;
  constructor() {
    super();
    this._unsubs = [];
    this._listCache = new Map;
  }
  connectedCallback() {
    const src = this.getAttribute("src");
    if (src) {
      if (isNestedWrapper(this))
        return;
      if (this._loadedSrc === src)
        return;
      Promise.resolve(load(this, src)).catch((err) => {
        throw new Error(`<data-wrapper src="${src}"> failed to load`, { cause: err });
      });
    } else
      wake(this, rootContext(this), load);
  }
  disconnectedCallback() {
    if (this._disconnectQueued)
      return;
    this._disconnectQueued = true;
    queueMicrotask(() => {
      this._disconnectQueued = false;
      if (this.isConnected)
        return;
      unwake(this);
      this._component?.destroy();
      this._component = undefined;
      this._loadedSrc = undefined;
    });
  }
}
var load = async (wrapper, src, ctx) => {
  if (wrapper._loadedSrc === src)
    return;
  const url = new URL(src, document.baseURI);
  if (!isTrustedViewSource(url)) {
    console.error(`data-wrapper: blocked cross-origin src "${src}"`);
    return;
  }
  const props = inputProps(src, url, ctx);
  const res = await fetch(url);
  const html = await res.text();
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const scripts = tpl.content.querySelectorAll('script[type="module"][data-module]');
  if (scripts.length > 1) {
    throw new Error(`Component view ${url.href} may contain only one data-module script`);
  }
  const script = scripts[0];
  let componentModule;
  let instance;
  const factoryUnsubs = [];
  if (script) {
    script.remove();
    componentModule = await importComponent(script, url);
    const factory = componentModule.default;
    if (factory !== undefined) {
      if (typeof factory !== "function") {
        throw new Error(`Component module ${url.href} default export must be a factory function`);
      }
      try {
        const context = Object.freeze({
          wrapper,
          url,
          params: url.searchParams,
          props,
          cleanup: (off) => factoryUnsubs.push(off)
        });
        const created = factory(context);
        if (created != null && typeof created !== "object") {
          throw new Error(`Component module ${url.href} factory must return an object or nothing`);
        }
        instance = created;
      } catch (error) {
        for (const off of factoryUnsubs.splice(0))
          off();
        throw error;
      }
    }
  }
  unwake(wrapper);
  wrapper._component?.destroy();
  wrapper.innerHTML = "";
  wrapper.append(tpl.content);
  wrapper._unsubs = factoryUnsubs;
  wrapper._listCache = new Map;
  wrapper._component = componentModule ? new ComponentRuntime(wrapper, componentModule, instance) : undefined;
  wake(wrapper, rootContext(wrapper), load);
  wrapper._loadedSrc = src;
};
if (typeof customElements !== "undefined" && !customElements.get("data-wrapper")) {
  customElements.define("data-wrapper", DataWrapper);
}
export {
  q,
  pURL,
  p,
  on,
  nearestItem,
  flush,
  emit,
  action,
  DW_FORMATTERS,
  DW_DIRECTIVES
};
