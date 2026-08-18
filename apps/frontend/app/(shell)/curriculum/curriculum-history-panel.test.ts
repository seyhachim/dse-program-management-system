import { expect, test } from "bun:test";
import { CURRICULUM_DIFF_KINDS } from "@dse-pms/shared-types";
import { CURRICULUM_DIFF_LABEL } from "./curriculum-history-panel.tsx";

test("curriculum comparison UI labels every supported diff category", () => {
  expect(Object.keys(CURRICULUM_DIFF_LABEL).sort()).toEqual([...CURRICULUM_DIFF_KINDS].sort());
  for (const kind of CURRICULUM_DIFF_KINDS) {
    expect(CURRICULUM_DIFF_LABEL[kind].length).toBeGreaterThan(0);
  }
});
