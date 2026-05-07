// Dev / test static file server — used by playwright.config.ts webServer
// Serves the project root; Bun.file infers Content-Type from extension.

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
        const url  = new URL(req.url);
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = Bun.file('.' + path);

        if (!(await file.exists())) {
            return new Response('Not found', { status: 404 });
        }

        return new Response(file);
    },
});

console.log(`Serving at http://localhost:${server.port}`);
