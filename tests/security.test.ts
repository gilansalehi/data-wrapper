// DOM-safety contract: the generic `$prop` binding must keep the safe sink and
// the dangerous sink distinguishable. `$text` is textContent; raw HTML needs the
// named `$unsafeHTML` opt-in; and `javascript:`-scheme values are neutralized in
// URL attributes. Driven through the real wire/wake path; observable behavior only.
import { test, expect, spyOn } from 'bun:test';
import { ComponentRuntime } from '../src/lib/component.ts';
import { load } from '../src/lib/element.ts';
import { rootContext, wake, type Wrapper } from '../src/lib/engine.ts';

// Build a wrapper holding one child element with a single token attribute, then
// wake it against a module scope. createElement/append per the harness rule.
const mountChild = (
    tag:    string,
    attr:   string,
    value:  string,
    module: Record<string, unknown>,
): { wrapper: Wrapper; child: Element } => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    const child = document.createElement(tag);
    child.setAttribute(attr, value);
    wrapper.append(child);
    wrapper._component = new ComponentRuntime(wrapper, module);
    wake(wrapper, rootContext(wrapper));
    return { wrapper, child };
};

test('$innerHTML throws so a dev must name the danger', () => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    const child = document.createElement('div');
    child.setAttribute('$innerHTML', 'markup');
    wrapper.append(child);
    wrapper._component = new ComponentRuntime(wrapper, { markup: '<b>x</b>' });

    expect(() => wake(wrapper, rootContext(wrapper))).toThrow(/unsafeHTML/);
});

test('$unsafeHTML is the explicit opt-in and writes raw HTML', () => {
    const { child } = mountChild('div', '$unsafeHTML', 'markup', { markup: '<b>hi</b>' });
    expect(child.querySelector('b')?.textContent).toBe('hi');
});

test('$text writes markup as inert text, never parsed HTML', () => {
    const { child } = mountChild('div', '$text', 'markup', { markup: '<b>hi</b>' });
    expect(child.querySelector('b')).toBeNull();
    expect(child.textContent).toBe('<b>hi</b>');
});

test('a javascript: value is blocked from a URL attribute', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'javascript:alert(1)' });
    expect(child.getAttribute('href')).toBeNull();
});

test('an ordinary URL still binds', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'https://example.com/' });
    expect(child.getAttribute('href')).toBe('https://example.com/');
});

test('a javascript: scheme obfuscated with control chars is still blocked', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'java\tscript:alert(1)' });
    expect(child.getAttribute('href')).toBeNull();
});

test('a dangerous scheme is blocked across the URL-attr set (formaction)', () => {
    const { child } = mountChild('button', '$formaction', 'go', { go: 'javascript:steal()' });
    expect(child.getAttribute('formaction')).toBeNull();
});

test('mailto: is allowed on href (link schemes must not break)', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'mailto:hi@example.com' });
    expect(child.getAttribute('href')).toBe('mailto:hi@example.com');
});

test('tel: is allowed on href', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'tel:+15551234567' });
    expect(child.getAttribute('href')).toBe('tel:+15551234567');
});

test('link schemes do not leak into form sinks (mailto: formaction dropped)', () => {
    const { child } = mountChild('button', '$formaction', 'go', { go: 'mailto:hi@example.com' });
    expect(child.getAttribute('formaction')).toBeNull();
});

test('data: is allowed on a media src', () => {
    const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    const { child } = mountChild('img', '$src', 'pic', { pic: gif });
    expect(child.getAttribute('src')).toBe(gif);
});

test('data: is dropped from href (navigation sink)', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'data:text/html,<b>x</b>' });
    expect(child.getAttribute('href')).toBeNull();
});

test('an unknown scheme is dropped (allowlist, not blocklist)', () => {
    const { child } = mountChild('a', '$href', 'link', { link: 'foo:whatever' });
    expect(child.getAttribute('href')).toBeNull();
});

test('a schemeless relative path still binds', () => {
    const { child } = mountChild('a', '$href', 'link', { link: '/framework#tokens' });
    expect(child.getAttribute('href')).toBe('/framework#tokens');
});

test('binding an event handler with $ throws and points to @event', () => {
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;
    const child = document.createElement('button');
    child.setAttribute('$onclick', 'handler');
    wrapper.append(child);
    wrapper._component = new ComponentRuntime(wrapper, { handler: () => {} });

    expect(() => wake(wrapper, rootContext(wrapper))).toThrow(/@click/);
});

test('$srcdoc is an allowed acknowledged sink (no safe twin, naming is the opt-in)', () => {
    const { child } = mountChild('iframe', '$srcdoc', 'doc', { doc: '<b>x</b>' });
    const written = (child as HTMLIFrameElement).srcdoc || child.getAttribute('srcdoc');
    expect(written).toBe('<b>x</b>');
});

test('<data-wrapper src> allows same-origin views by default', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () => new Response('<p id="ok">ok</p>')) as unknown as typeof fetch,
    );
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;

    try {
        await load(wrapper, 'http://example.test/view.html');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(wrapper.querySelector('#ok')?.textContent).toBe('ok');
        expect(wrapper._loadedSrc).toBe('http://example.test/view.html');
    } finally {
        fetchSpy.mockRestore();
    }
});

test('<data-wrapper src> rejects failed fetch responses with status attribution', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () => new Response('missing', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch,
    );
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;

    try {
        await expect(load(wrapper, 'http://example.test/missing.html')).rejects.toThrow('404 Not Found');
        expect(wrapper._loadedSrc).toBeUndefined();
        expect(wrapper.childElementCount).toBe(0);
    } finally {
        fetchSpy.mockRestore();
    }
});

test('<data-wrapper src> blocks cross-origin views by default', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () => new Response('<p>should not load</p>')) as unknown as typeof fetch,
    );
    const error = spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;

    try {
        await load(wrapper, 'https://attacker.example/view.html');
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('blocked cross-origin src'));
        expect(wrapper._loadedSrc).toBeUndefined();
        expect(wrapper.childElementCount).toBe(0);
    } finally {
        fetchSpy.mockRestore();
        error.mockRestore();
    }
});

test('a cross-origin base tag cannot define the trusted view origin', async () => {
    const base = document.createElement('base');
    base.href = 'https://attacker.example/';
    document.head.append(base);

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () => new Response('<p>should not load</p>')) as unknown as typeof fetch,
    );
    const error = spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;

    try {
        const freshElementModule = '../src/lib/element.ts?hostile-base';
        const { load: guardedLoad } = await import(freshElementModule) as typeof import('../src/lib/element.ts');

        await guardedLoad(wrapper, 'https://attacker.example/view.html');

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('blocked cross-origin src'));
    } finally {
        base.remove();
        fetchSpy.mockRestore();
        error.mockRestore();
    }
});

test('later policy meta tags cannot widen the alpha same-origin guard', async () => {
    const meta = document.createElement('meta');
    meta.name = 'data-wrapper-src-policy';
    meta.content = "'self' https://attacker.example";
    document.head.append(meta);

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        (async () => new Response('<p>should not load</p>')) as unknown as typeof fetch,
    );
    const error = spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = document.createElement('data-wrapper') as unknown as Wrapper;

    try {
        await load(wrapper, 'https://attacker.example/view.html');
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
    } finally {
        meta.remove();
        fetchSpy.mockRestore();
        error.mockRestore();
    }
});

test('module shim fallback carries opt-in subresource integrity', async () => {
    const config = document.createElement('script');
    config.dataset.shimSrc = 'https://cdn.example/es-module-shims.js';
    config.dataset.shimIntegrity = 'sha384-testhash';
    document.head.append(config);

    const global = globalThis as typeof globalThis & {
        importShim?: (specifier: string) => Promise<Record<string, unknown>>;
    };
    const previousShim = global.importShim;
    delete global.importShim;
    let injected: HTMLScriptElement | undefined;
    const appendSpy = spyOn(document.head, 'append').mockImplementation(((...nodes: (Node | string)[]) => {
        injected = nodes.find((node): node is HTMLScriptElement => node instanceof HTMLScriptElement);
    }) as typeof document.head.append);

    try {
        const freshElementModule = '../src/lib/element.ts?shim-integrity';
        const { loadShim: guardedLoadShim } = await import(freshElementModule) as typeof import('../src/lib/element.ts');
        const pending = guardedLoadShim();

        expect(appendSpy).toHaveBeenCalled();
        expect(injected?.src).toBe('https://cdn.example/es-module-shims.js');
        expect(injected?.integrity).toBe('sha384-testhash');
        expect(injected?.crossOrigin).toBe('anonymous');

        global.importShim = async () => ({});
        injected?.dispatchEvent(new Event('load'));
        await pending;
    } finally {
        appendSpy.mockRestore();
        config.remove();
        if (previousShim) global.importShim = previousShim;
        else delete global.importShim;
    }
});
