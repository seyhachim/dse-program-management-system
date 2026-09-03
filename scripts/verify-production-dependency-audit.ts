import { readFile } from "node:fs/promises";

const reportPath = process.argv[2] ?? "dependency-audit.json";

type Advisory = {
  id: number;
  url: string;
  title: string;
  severity: string;
};

type AuditReport = Record<string, Advisory[]>;

const DEV_ONLY_ADVISORIES: Record<string, Set<number>> = {
  "@hono/node-server": new Set([1139322]),
  "brace-expansion": new Set([1130591, 1130734]),
  hono: new Set([1130733, 1138771, 1138772, 1138773]),
  "ip-address": new Set([1130722, 1130723, 1130724]),
  "js-yaml": new Set([1138115]),
  postcss: new Set([1130709]),
  undici: new Set([1130715, 1130718, 1130726, 1130729, 1130731]),
};

// GHSA-2v37-7h3g-55p8 / CVE-2026-67213 is conditional on calling
// customAlphabet/customRandom with an attacker-controlled size of zero.
// The production PostCSS 8.5.23 path imports nanoid/non-secure and calls
// nanoid(6), so that primitive is absent. Review this exception by 2026-11-18
// or sooner if PostCSS changes its Nano ID usage. Owner: DSE PMS maintainers.
const CONDITIONAL_RUNTIME_ADVISORIES: Record<string, Set<number>> = {
  nanoid: new Set([1139427]),
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const root = await readJson<{
  overrides?: Record<string, string>;
}>("package.json");
const frontend = await readJson<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}>("apps/frontend/package.json");
const ui = await readJson<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}>("packages/ui/package.json");

const structuralErrors: string[] = [];
if (root.overrides?.browserslist !== "^4.28.7") {
  structuralErrors.push(
    "root browserslist override must stay on the patched ^4.28.7 security line",
  );
}
if (root.overrides?.qs !== "6.16.0") {
  structuralErrors.push("root qs override must remain pinned to patched 6.16.0");
}
if (frontend.dependencies?.shadcn) {
  structuralErrors.push("apps/frontend must not ship shadcn as a production dependency");
}
if (!frontend.devDependencies?.shadcn) {
  structuralErrors.push("apps/frontend shadcn CLI classification is missing from devDependencies");
}
if (ui.dependencies?.shadcn) {
  structuralErrors.push("packages/ui must not ship shadcn as a production dependency");
}
if (!ui.devDependencies?.shadcn) {
  structuralErrors.push("packages/ui shadcn CLI classification is missing from devDependencies");
}
if (frontend.devDependencies?.postcss !== "8.5.23") {
  structuralErrors.push("apps/frontend build PostCSS must remain pinned to patched 8.5.23");
}
if (frontend.dependencies?.next !== "^16.3.0") {
  structuralErrors.push("apps/frontend Next.js must remain on the remediated ^16.3.0 line");
}
if (frontend.devDependencies?.["eslint-config-next"] !== "16.3.0") {
  structuralErrors.push("eslint-config-next must stay aligned with the remediated Next.js line");
}

if (structuralErrors.length > 0) {
  for (const error of structuralErrors) console.error(`STRUCTURAL POLICY ERROR: ${error}`);
  process.exit(1);
}

const report = await readJson<AuditReport>(reportPath);
const unknown: Array<{ packageName: string; advisory: Advisory }> = [];
const classified: Array<{ packageName: string; advisory: Advisory; disposition: string }> = [];

for (const [packageName, advisories] of Object.entries(report)) {
  for (const advisory of advisories) {
    if (DEV_ONLY_ADVISORIES[packageName]?.has(advisory.id)) {
      classified.push({ packageName, advisory, disposition: "not-applicable: dev-only workspace tooling" });
      continue;
    }
    if (CONDITIONAL_RUNTIME_ADVISORIES[packageName]?.has(advisory.id)) {
      classified.push({
        packageName,
        advisory,
        disposition: "temporarily-accepted: vulnerable API primitive is not used by PostCSS 8.5.23; review by 2026-11-18",
      });
      continue;
    }
    unknown.push({ packageName, advisory });
  }
}

for (const item of classified) {
  console.log(
    `CLASSIFIED ${item.packageName} #${item.advisory.id} ${item.advisory.severity}: ${item.disposition}`,
  );
}

if (unknown.length > 0) {
  for (const item of unknown) {
    console.error(
      `UNCLASSIFIED ${item.packageName} #${item.advisory.id} ${item.advisory.severity}: ${item.advisory.title}`,
    );
  }
  process.exit(1);
}

console.log(`Dependency audit policy passed: ${classified.length} known advisory records classified, 0 unclassified.`);
