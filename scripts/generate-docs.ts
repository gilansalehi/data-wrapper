const REGION_START = /^\s*\/\/\s*#region\s+(\S+)/;
const REGION_END   = /^\s*\/\/\s*#endregion/;

type Region = { name: string; body: string[] };

const extract = (src: string): Region[] => {
    const regions: Region[] = [];
    let current: Region | null = null;

    for (const line of src.split('\n')) {
        const start = line.match(REGION_START);
        if (start)                 { current = { name: start[1], body: [] }; continue; }
        if (REGION_END.test(line)) { if (current) regions.push(current); current = null; continue; }
        if (current)                 current.body.push(line);
    }
    return regions;
};

const partial = (source: string, region: Region) =>
    `<figure data-source="${source}" data-region="${region.name}">\n` +
    `  <pre><code>${Bun.escapeHTML(region.body.join('\n'))}</code></pre>\n` +
    `</figure>\n`;

for await (const path of new Bun.Glob('src/lib/*.ts').scan('.')) {
    const source = path.split('/').pop()!;
    for (const region of extract(await Bun.file(path).text())) {
        await Bun.write(`partials/docs/${region.name}.html`, partial(source, region));
    }
}
