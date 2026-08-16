import { expect, test } from "bun:test";
import { curriculumWorkspaceManifest, navForRole } from "./index.ts";

test("Curriculum navigation is limited to Head/Admin programme roles", () => {
  expect(navForRole([curriculumWorkspaceManifest], ["admin"]).map((route) => route.path)).toEqual(["/curriculum"]);
  expect(navForRole([curriculumWorkspaceManifest], ["program_coordinator"]).map((route) => route.path)).toEqual(["/curriculum"]);

  for (const role of ["program_secretary", "qa_reviewer", "lecturer", "student"] as const) {
    expect(navForRole([curriculumWorkspaceManifest], [role])).toHaveLength(0);
  }
});
