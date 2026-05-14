import * as Bun from 'bun'
// Extracts `// #region NAME` ... `// #endregion` blocks from src/lib/*.ts
// and emits one HTML partial per region into views/docs/. If a region begins
// with an `@docs` comment block (line-comment or block-comment), that block
// becomes a <figcaption> above the code; the rest of the region is the body.
//
// Flags:
//   --strict   exit nonzero on doc drift:
//                hard error  — partial referenced from documentation.html is missing
//                warning     — partial emitted but unreferenced

const REGION_START = /^\s*\/\/\s*#region\s+(\S+)/;
const REGION_END   = /^\s*\/\/\s*#endregion/;

// inside-region doc-block matchers (only consulted before the body has any code)
const DOC_LINE_START  = /^\s*\/\/\s*@docs\s+(.*)$/;
const DOC_LINE_CONT   = /^\s*\/\/\s?(.*)$/;
const DOC_BLOCK_ONE   = /^\s*\/\*\*?\s*@docs\s+(.*?)\s*\*\/\s*$/;
const DOC_BLOCK_START = /^\s*\/\*\*?\s*@docs\s+(.*)$/;
const DOC_BLOCK_END   = /^\s*\*?\s*(.*?)\s*\*\/\s*$/;
const DOC_BLOCK_CONT  = /^\s*\*?\s?(.*)$/;

type Region = { name: string; docs: string[]; body: string[] };

const extract = (src: string): Region[] => {
    const regions: Region[] = [];
    let current: Region | null = null;
    let inDoc: 'line' | 'block' | null = null;

    for (const line of src.split('\n')) {
        const start = line.match(REGION_START);
        if (start) {
            if (current) { console.warn(`docs: region "${current.name}" closed implicitly by "${start[1]}" — add #endregion`); regions.push(current); }
            current = { name: start[1], docs: [], body: [] }; inDoc = null;
            continue;
        }
        if (REGION_END.test(line)) { if (current) regions.push(current); current = null; inDoc = null; continue; }
        if (!current) continue;

        // Doc-collection phase: only while no code has landed in the body yet.
        if (current.body.length === 0) {
            if (inDoc === 'block') {
                const end = line.match(DOC_BLOCK_END);
                if (end && line.includes('*/')) { if (end[1]) current.docs.push(end[1]); inDoc = null; continue; }
                current.docs.push(line.match(DOC_BLOCK_CONT)?.[1] ?? '');
                continue;
            }
            if (inDoc === 'line') {
                const cont = line.match(DOC_LINE_CONT);
                if (cont && /^\s*\/\//.test(line)) { current.docs.push(cont[1]); continue; }
                inDoc = null; // fall through into body parsing
            }
            const one = line.match(DOC_BLOCK_ONE);
            if (one) { current.docs.push(one[1]); continue; }
            const blk = line.match(DOC_BLOCK_START);
            if (blk) { current.docs.push(blk[1]); inDoc = 'block'; continue; }
            const ln  = line.match(DOC_LINE_START);
            if (ln)  { current.docs.push(ln[1]); inDoc = 'line'; continue; }
        }

        current.body.push(line);
    }
    return regions;
};

// Trim leading/trailing blank lines from the code body so the snippet hugs its content.
const trim = (lines: string[]) => {
    let i = 0, j = lines.length;
    while (i < j && lines[i].trim() === '') i++;
    while (j > i && lines[j - 1].trim() === '') j--;
    return lines.slice(i, j);
};

// Plain prose with one inline transform: backticked spans → <code>.
const caption = (docs: string[]) => {
    const text = docs.map(l => l.trim()).filter(Boolean).join(' ');
    if (!text) return '';
    return '  <figcaption>' + Bun.escapeHTML(text).replace(/`([^`]+)`/g, '<code>$1</code>') + '</figcaption>\n';
};

const partial = (source: string, region: Region) =>
    `<figure data-source="${source}" data-region="${region.name}">\n` +
    caption(region.docs) +
    `  <pre><code>${Bun.escapeHTML(trim(region.body).join('\n'))}</code></pre>\n` +
    `</figure>\n`;

// Clear stale partials so the directory is always a faithful snapshot of source.
for await (const path of new Bun.Glob('views/docs/*.html').scan('.')) {
    await Bun.file(path).delete();
}

const emitted = new Set<string>();

for await (const path of new Bun.Glob('src/lib/*.ts').scan('.')) {
    const source = path.split('/').pop()!;
    for (const region of extract(await Bun.file(path).text())) {
        const out = `views/docs/${region.name}.html`;
        await Bun.write(out, partial(source, region));
        emitted.add(`${region.name}.html`);
    }
}

if (Bun.argv.includes('--strict')) {
    const html = await Bun.file('documentation.html').text();
    const referenced = new Set<string>();
    for (const m of html.matchAll(/src="\/views\/docs\/([^"]+\.html)"/g)) referenced.add(m[1]);

    const missing = [...referenced].filter(f => !emitted.has(f));
    const orphan  = [...emitted].filter(f => !referenced.has(f));

    if (orphan.length)  console.warn('docs: orphan partials (not linked from documentation.html):', orphan);
    if (missing.length) { console.error('docs: referenced partials are missing:', missing); process.exit(1); }
}
