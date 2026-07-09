const root = "site";
const siteOrigin = "https://data-wrapper.org";

const glob = new Bun.Glob("**/*");

const files: string[] = [];
for await (const file of glob.scan({ cwd: root, onlyFiles: true })) files.push(file);

const htmlFiles = files.filter(file => file.endsWith(".html"));
const cssFiles = files.filter(file => file.endsWith(".css"));

const errors: string[] = [];

const privatePrefixes = [
    ".agents/",
    ".codex/",
    ".git/",
    "node_modules/",
    "scripts/",
    "src/",
    "tests/",
    "tickets/",
];

const privateNames = new Set([
    "bun.lock",
    "collab.md",
    "package.json",
    "tsconfig.json",
]);

for (const file of files) {
    if (privatePrefixes.some(prefix => file.startsWith(prefix)) || privateNames.has(file)) {
        errors.push(`public root contains private file: ${file}`);
    }
}

const exists = async (path: string): Promise<boolean> =>
    await Bun.file(`${root}/${path}`).exists()
    || await Bun.file(`${root}/${path}.html`).exists();

const normalize = (path: string): string => {
    const out: string[] = [];
    for (const part of path.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") out.pop();
        else out.push(part);
    }
    return out.join("/");
};

const isExternal = (value: string): boolean =>
    /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)
    || /^(?:mailto|tel|data|blob|javascript):/i.test(value);

const localPath = (from: string, value: string): string | null => {
    const clean = value.trim().split("#")[0].split("?")[0];
    if (!clean || clean === "/" || clean.startsWith("#") || isExternal(clean)) return null;
    if (clean.startsWith("/")) return normalize(clean.slice(1));

    const base = from.split("/");
    base.pop();
    return normalize([...base, clean].join("/"));
};

const checkLocalReference = async (from: string, value: string, label: string) => {
    const path = localPath(from, value);
    if (path && !(await exists(path))) errors.push(`${from}: missing ${label} ${value}`);
};

const stripExamples = (text: string): string =>
    text
        .replace(/<script\b(?![^>]*\bsrc=)[\s\S]*?<\/script>/gi, "")
        .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
        .replace(/<code\b[\s\S]*?<\/code>/gi, "");

const htmlAttr = /(?<![$@*A-Za-z0-9_-])(?:src|href|action|poster)=("|')(.*?)\1/g;

for (const file of htmlFiles) {
    const text = stripExamples(await Bun.file(`${root}/${file}`).text());
    for (const match of text.matchAll(htmlAttr)) {
        await checkLocalReference(file, match[2], "reference");
    }
}

const cssUrl = /url\(([^)]+)\)/g;

for (const file of cssFiles) {
    const text = await Bun.file(`${root}/${file}`).text();
    for (const match of text.matchAll(cssUrl)) {
        const value = match[1].trim().replace(/^['"]|['"]$/g, "");
        await checkLocalReference(file, value, "css url");
    }
}

const manifestPath = "site.webmanifest";
if (await Bun.file(`${root}/${manifestPath}`).exists()) {
    const manifest = await Bun.file(`${root}/${manifestPath}`).json();
    for (const icon of manifest.icons ?? []) {
        if (typeof icon.src === "string") await checkLocalReference(manifestPath, icon.src, "manifest icon");
    }
}

const sitemapPath = "sitemap.xml";
if (await Bun.file(`${root}/${sitemapPath}`).exists()) {
    const sitemap = await Bun.file(`${root}/${sitemapPath}`).text();
    for (const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
        const loc = match[1].trim();
        if (!loc.startsWith(siteOrigin)) continue;
        await checkLocalReference(sitemapPath, loc.slice(siteOrigin.length) || "/", "sitemap route");
    }
}

if (errors.length) {
    console.error("Site deploy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log(
    `Site deploy check passed (${htmlFiles.length} HTML files, ${cssFiles.length} CSS files, ${files.length} total files).`,
);
