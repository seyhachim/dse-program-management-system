import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const rollCallDialogSource = readFileSync(new URL("./roll-call-dialog.tsx", import.meta.url), "utf8");

describe("Roll Call dialog layout", () => {
  test("overrides the shared responsive dialog max-width cap", () => {
    expect(rollCallDialogSource).toContain("w-[min(1120px,94vw)]");
    expect(rollCallDialogSource).toContain("sm:max-w-none");
  });
});
