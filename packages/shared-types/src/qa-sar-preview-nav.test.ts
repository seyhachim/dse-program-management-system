import { expect, test } from "bun:test";
import { navForRole, qaManifest } from "./plugins";

test("SAR Preview is visible to programme leadership and QA reviewers", () => {
  for (const role of ["admin", "program_coordinator", "qa_reviewer"] as const) {
    const paths = navForRole([qaManifest], [role]).map((route) => route.path);
    expect(paths).toContain("/aun-qa/sar-preview");
  }
});

test("SAR Preview is not exposed to contributors or ordinary lecturers", () => {
  for (const role of ["qa_contributor", "lecturer"] as const) {
    const paths = navForRole([qaManifest], [role]).map((route) => route.path);
    expect(paths).not.toContain("/aun-qa/sar-preview");
  }
});
