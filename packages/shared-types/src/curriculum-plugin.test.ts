import { expect, test } from "bun:test";
import { curriculumWorkspaceManifest, navForRole } from "./index.ts";

test("Curriculum navigation allows programme writers and read-only reviewers", () => {
  for (const role of [
    "admin",
    "program_coordinator",
    "program_secretary",
    "qa_reviewer",
  ] as const) {
    expect(
      navForRole([curriculumWorkspaceManifest], [role]).map(
        (route) => route.path,
      ),
    ).toEqual(["/curriculum"]);
  }

  for (const role of ["lecturer", "student"] as const) {
    expect(navForRole([curriculumWorkspaceManifest], [role])).toHaveLength(0);
  }
});
