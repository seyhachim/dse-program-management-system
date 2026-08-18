import { expect, test } from "bun:test";
import { navForRole, pluginManifests } from "./plugins.ts";

test("Evidence Library is visible to QA contributors, leadership, and reviewers", () => {
  for (const role of ["admin", "program_coordinator", "qa_contributor", "qa_reviewer"] as const) {
    const paths = navForRole(pluginManifests, [role]).map((route) => route.path);
    expect(paths).toContain("/aun-qa/evidence");
  }
});

test("Evidence Library is not exposed to ordinary lecturer or student roles", () => {
  for (const role of ["lecturer", "student"] as const) {
    const paths = navForRole(pluginManifests, [role]).map((route) => route.path);
    expect(paths).not.toContain("/aun-qa/evidence");
  }
});
