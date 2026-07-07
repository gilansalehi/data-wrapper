// Dev / test static file server.
//
// The public website lives in site/ because Cloudflare Pages serves that
// directory directly with no app build step. Keeping the local server pointed at
// the same root makes development match production, while src/lib/ remains the
// package source that builds to dist/ for npm.
//
// Bun.file infers Content-Type from extension. View modules are handled
// client-side by data-wrapper via import maps.

const envPort = Number.parseInt(Bun.env.PORT ?? '', 10);
const port = Number.isFinite(envPort) ? envPort : 3000;
const hostname = Bun.env.HOST || '127.0.0.1';
const root = Bun.env.SERVE_ROOT || 'site';

const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
        const url  = new URL(req.url);
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        const parts = decodeURIComponent(path).split('/').filter(Boolean);
        if (parts.includes('..')) return new Response('Bad request', { status: 400 });

        let file = Bun.file(`${root}/${parts.join('/')}`);

        // Mirror Cloudflare Pages' clean-URL behavior locally: /framework -> /framework.html.
        if (!(await file.exists())) {
            const htmlFallback = Bun.file(`${root}/${parts.join('/')}.html`);
            if (await htmlFallback.exists()) file = htmlFallback;
            else return new Response('Not found', { status: 404 });
        }

        return new Response(file, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    },
});

console.log(`Serving ${root} at http://${hostname}:${server.port}`);
