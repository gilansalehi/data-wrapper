// Dev / test static file server. Serves the project root; Bun.file infers
// Content-Type from extension. No special routes — view modules are handled
// client-side by the framework via import maps.

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
        const url  = new URL(req.url);
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = Bun.file('.' + path);

        if (!(await file.exists())) return new Response('Not found', { status: 404 });

        return new Response(file, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        });
    },
});

console.log(`Serving at http://localhost:${server.port}`);
