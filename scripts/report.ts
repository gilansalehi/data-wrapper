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

// Size targets, not hard budgets: they exist to catch bloat, not to block a
// tiny overage. Within GRACE of the target the report warns; past it, fails.
const TARGETS = {
  esmRaw: 30_000,
  minRaw: 17_000,
  minGzip: 7_000,
};
const GRACE = 0.1;

const targets = [
  { label: "ESM raw", limit: TARGETS.esmRaw, value: report.esm.raw },
  { label: "IIFE min raw", limit: TARGETS.minRaw, value: report.min.raw },
  { label: "IIFE min gzip", limit: TARGETS.minGzip, value: report.min.gzip },
];

// Target usage feeds the size view's meters: a style string for the fill's
// --pct custom property, and a matching text label.
const pct = (value: number, limit: number): number =>
  Math.min(100, Math.round((value / limit) * 100));

const scriptBlock = `<script type="module" data-module="@info/size">
    export const esmBytes = '${formatBytes(report.esm.raw)}';
    export const esmGzipBytes = '${formatBytes(report.esm.gzip)}';
    export const minBytes = '${formatBytes(report.min.raw)}';
    export const minGzipBytes = '${formatBytes(report.min.gzip)}';
    export const esmRawTarget = '--pct: ${pct(report.esm.raw, TARGETS.esmRaw)}%';
    export const esmRawPct = '${pct(report.esm.raw, TARGETS.esmRaw)}% of target';
    export const minRawTarget = '--pct: ${pct(report.min.raw, TARGETS.minRaw)}%';
    export const minRawPct = '${pct(report.min.raw, TARGETS.minRaw)}% of target';
    export const minGzipTarget = '--pct: ${pct(report.min.gzip, TARGETS.minGzip)}%';
    export const minGzipPct = '${pct(report.min.gzip, TARGETS.minGzip)}% of target';
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

console.log("\nTarget");
let failed = false;
for (const target of targets) {
  const over = target.value - target.limit;
  const status = over <= 0 ? "PASS" : over <= target.limit * GRACE ? "OVER" : "FAIL";
  failed ||= status === "FAIL";
  console.log(
    `${status} ${target.label}: ${formatBytes(target.value)} vs target ${formatBytes(
      target.limit,
    )}${status === "OVER" ? " (within grace — trim when convenient)" : ""}`,
  );
}

console.log("\nUpdated site/views/info/size.html");

if (failed) {
  process.exitCode = 1;
}
