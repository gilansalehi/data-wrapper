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

// Ticket 024 harness: CSP='...policy...' bun serve.ts sends the policy on every
// response so CSP claims can be verified in a real browser. Off by default.
const csp = Bun.env.CSP;

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
        let status = 200;
        if (!(await file.exists())) {
            const htmlFallback = Bun.file(`${root}/${parts.join('/')}.html`);
            if (await htmlFallback.exists()) file = htmlFallback;
            else {
                // Mirror Cloudflare Pages: missing routes serve the custom 404 page.
                const notFound = Bun.file(`${root}/404.html`);
                if (!(await notFound.exists())) return new Response('Not found', { status: 404 });
                file = notFound;
                status = 404;
            }
        }

        const headers: Record<string, string> = {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        };
        if (csp) headers["Content-Security-Policy"] = csp;

        return new Response(file, { status, headers });
    },
});

console.log(`Serving ${root} at http://${hostname}:${server.port}`);
