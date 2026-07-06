import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const files = {
  esm: new URL("../dist/data-wrapper.js", import.meta.url),
  min: new URL("../dist/data-wrapper.min.js", import.meta.url),
};

const sizeView = new URL("../site/views/info/size.html", import.meta.url);

type ArtifactSize = {
  raw: number;
  gzip: number;
};

const measure = (url: URL): ArtifactSize => {
  const bytes = readFileSync(url);
  return {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
  };
};

const formatBytes = (bytes: number): string =>
  new Intl.NumberFormat("en-US").format(bytes);

const report = {
  esm: measure(files.esm),
  min: measure(files.min),
};

const budgets = [
  { label: "ESM raw", limit: 30_000, value: report.esm.raw },
  { label: "IIFE min raw", limit: 17_000, value: report.min.raw },
  { label: "IIFE min gzip", limit: 7_000, value: report.min.gzip },
];

const scriptBlock = `<script type="module" data-module="@info/size">
    export const esmBytes = '${formatBytes(report.esm.raw)}';
    export const esmGzipBytes = '${formatBytes(report.esm.gzip)}';
    export const minBytes = '${formatBytes(report.min.raw)}';
    export const minGzipBytes = '${formatBytes(report.min.gzip)}';
</script>`;

const source = readFileSync(sizeView, "utf8");
const moduleBlockPattern =
  /<script type="module" data-module="@info\/size">[\s\S]*?<\/script>/;

if (!moduleBlockPattern.test(source)) {
  throw new Error("Could not find @info/size module block to update.");
}

const next = source.replace(moduleBlockPattern, scriptBlock);

writeFileSync(sizeView, next);

const rows = [
  ["dist/data-wrapper.js", formatBytes(report.esm.raw), formatBytes(report.esm.gzip)],
  ["dist/data-wrapper.min.js", formatBytes(report.min.raw), formatBytes(report.min.gzip)],
];

const width = Math.max(...rows.map(([name]) => name.length));

console.log("data-wrapper size report\n");
console.log(`${"Artifact".padEnd(width)}  Raw bytes  Gzip bytes`);
for (const [name, raw, gzip] of rows) {
  console.log(`${name.padEnd(width)}  ${raw.padStart(9)}  ${gzip.padStart(10)}`);
}

console.log("\nBudget");
let failed = false;
for (const budget of budgets) {
  const actual = budget.value;
  const ok = actual <= budget.limit;
  failed ||= !ok;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${budget.label}: ${formatBytes(actual)} <= ${formatBytes(
      budget.limit,
    )}`,
  );
}

console.log("\nUpdated site/views/info/size.html");

if (failed) {
  process.exitCode = 1;
}
