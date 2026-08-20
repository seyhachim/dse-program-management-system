import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
  "dashboard/dashboard-client.tsx",
  "curriculum/curriculum-page-client.tsx",
  "aun-qa/workspace-client.tsx",
  "course-delivery/course-delivery-client.tsx",
] as const;

const FORBIDDEN_WORKFLOW_PALETTES = /(?:bg|text|border|ring)-(?:blue|emerald|amber|red|slate|violet)-/;

test("high-traffic workflow screens use semantic theme utilities", () => {
  for (const relativePath of TARGETS) {
    const source = readFileSync(join(import.meta.dir, relativePath), "utf8");
    expect(source, `${relativePath} should not hard-code workflow palette classes`).not.toMatch(
      FORBIDDEN_WORKFLOW_PALETTES,
    );
  }
});
