# COMPLETED

Ticket 020 is complete as of 2026-07-16.

Runtime support copies `data-shim-integrity` from the data-wrapper script tag
onto the injected es-module-shims fallback script and sets
`crossOrigin = 'anonymous'`, so the browser enforces native Subresource
Integrity when the shim fallback is needed.

The promo site keeps the third-party CDN shim, pinned to:

```txt
https://ga.jspm.io/npm:es-module-shims@2.8.1/dist/es-module-shims.js
```

The site shells, install docs, and README carry the verified integrity value:

```txt
sha384-Ojz/JNsyOdkNfGWOlfhDmeq68SXcsoWSABV4yVQn8Wr/YaKJJTrZs5p2Zi39PWuL
```

Browser smoke was completed by the release owner: the pinned shim version works
with the configured integrity value.
