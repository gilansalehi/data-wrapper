import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type AppOptions = {
    body:    string;
    modules: string;
    views:   Record<string, string>;
};

let bundle = '';

test.beforeAll(async () => {
    bundle = await readFile(new URL('../../dist/data-wrapper.js', import.meta.url), 'utf8');
});

const view = (moduleName: string, body: string): string =>
    `<script type="module" data-module="${moduleName}"></script>${body}`;

const pageHTML = ({ body, modules }: AppOptions): string => `<!doctype html>
<meta charset="utf-8">
<script>
const modules = Object.create(null);
${modules}
window.importShim = async name => {
    const module = modules[name];
    if (!module) throw new Error('Unexpected component import ' + name);
    return module;
};
</script>
<script type="module" src="/dist/data-wrapper.js"></script>
${body}`;

const boot = async (page: Page, options: AppOptions) => {
    await page.route('http://example.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/dist/data-wrapper.js') {
            await route.fulfill({ body: bundle, contentType: 'text/javascript' });
            return;
        }
        if (url.pathname === '/' || url.pathname === '/test.html') {
            await route.fulfill({ body: pageHTML(options), contentType: 'text/html' });
            return;
        }
        const html = options.views[url.pathname];
        if (html) {
            await route.fulfill({ body: html, contentType: 'text/html' });
            return;
        }
        await route.fulfill({ status: 404, body: `Not found: ${url.pathname}` });
    });
    await page.goto('/test.html');
};

test('*src loads a view from a resolved URL, replacing the fallback', async ({ page }) => {
    await boot(page, {
        body: `<data-wrapper src="/views/layout-ref.html?view=${encodeURIComponent('/views/child-ref.html')}"></data-wrapper>`,
        modules: `
modules['@layout-ref'] = { default: ({ props }) => ({ view: props.view }) };
modules['@child-ref'] = { default: () => ({}) };
`,
        views: {
            '/views/layout-ref.html': view(
                '@layout-ref',
                '<article><template *src="view"><p id="fallback">none</p></template></article>',
            ),
            '/views/child-ref.html': view('@child-ref', '<p id="child">child body</p>'),
        },
    });

    await expect(page.locator('article #child')).toHaveText('child body');
    await expect(page.locator('#fallback')).toHaveCount(0);
});

test('*src projects authored children targeted by their slot attribute', async ({ page }) => {
    await boot(page, {
        body: `
<data-wrapper src="/views/layout-toc.html">
    <ol slot="toc"><li>Intro</li><li>Install</li></ol>
</data-wrapper>`,
        modules: `
modules['@layout-toc'] = { default: ({ slots }) => ({ toc: slots.toc }) };
`,
        views: {
            '/views/layout-toc.html': view(
                '@layout-toc',
                '<nav><template *src="toc"><p id="fallback">no toc</p></template></nav>',
            ),
        },
    });

    await expect(page.locator('nav ol li')).toHaveCount(2);
    await expect(page.locator('nav ol')).toContainText('Intro');
    await expect(page.locator('#fallback')).toHaveCount(0);
});

test('*src renders the multi-root template body as fallback when the source is empty', async ({ page }) => {
    await boot(page, {
        body: '<data-wrapper src="/views/layout-fallback.html"></data-wrapper>',
        modules: `
modules['@layout-fallback'] = { default: ({ props }) => ({ view: props.view }) };
`,
        views: {
            '/views/layout-fallback.html': view(
                '@layout-fallback',
                '<main><template *src="view"><p id="a">a</p><p id="b">b</p></template></main>',
            ),
        },
    });

    await expect(page.locator('#a')).toHaveText('a');
    await expect(page.locator('#b')).toHaveText('b');
});

test('projected content wakes in the layout binding context', async ({ page }) => {
    await boot(page, {
        body: `
<data-wrapper src="/views/layout-context.html">
    <h1 slot="brand" $text="title"></h1>
</data-wrapper>`,
        modules: `
modules['@layout-context'] = {
    default: ({ slots }) => ({ brand: slots.brand, title: 'data-wrapper' })
};
`,
        views: {
            '/views/layout-context.html': view(
                '@layout-context',
                '<header><template *src="brand"></template></header>',
            ),
        },
    });

    await expect(page.locator('header h1')).toHaveText('data-wrapper');
});

test('a view loaded by *src is cleaned up when the layout unloads', async ({ page }) => {
    await boot(page, {
        body: `<data-wrapper id="root" src="/views/layout-teardown.html?view=${encodeURIComponent('/views/child-teardown.html')}"></data-wrapper>`,
        modules: `
window.cleaned = false;
modules['@layout-teardown'] = { default: ({ props }) => ({ view: props.view }) };
modules['@child-teardown'] = {
    default: ctx => {
        ctx.cleanup(() => { window.cleaned = true; });
        return {};
    }
};
`,
        views: {
            '/views/layout-teardown.html': view(
                '@layout-teardown',
                '<main><template *src="view"></template></main>',
            ),
            '/views/child-teardown.html': view('@child-teardown', '<p id="child">child</p>'),
        },
    });

    await expect(page.locator('#child')).toHaveText('child');
    await expect.poll(() => page.evaluate(() =>
        (window as unknown as Window & { cleaned: boolean }).cleaned
    )).toBe(false);

    await page.locator('#root').evaluate(el => el.remove());
    await expect.poll(() => page.evaluate(() =>
        (window as unknown as Window & { cleaned: boolean }).cleaned
    )).toBe(true);
});

test('a projected nested <data-wrapper src> loads correctly after the move', async ({ page }) => {
    await boot(page, {
        body: `
<data-wrapper src="/views/layout-move.html">
    <data-wrapper slot="body" src="/views/card-move.html"></data-wrapper>
</data-wrapper>`,
        modules: `
modules['@layout-move'] = { default: ({ slots }) => ({ body: slots.body }) };
modules['@card-move'] = { default: () => ({}) };
`,
        views: {
            '/views/layout-move.html': view(
                '@layout-move',
                '<main><template *src="body"></template></main>',
            ),
            '/views/card-move.html': view('@card-move', '<p id="card">card body</p>'),
        },
    });

    await expect(page.locator('main #card')).toHaveText('card body');
});
