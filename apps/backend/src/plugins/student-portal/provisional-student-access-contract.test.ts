import { describe, expect, test } from "bun:test";

const sourceGlob = new Bun.Glob("*.ts");

describe("Student Portal provisional identity contract", () => {
  test("does not use official Student ID as a self-service access gate", async () => {
    const violations: string[] = [];

    for (const filename of sourceGlob.scanSync(import.meta.dir)) {
      if (
        filename.endsWith(".test.ts") ||
        filename.endsWith("-db.test.ts")
      ) {
        continue;
      }

      const source = await Bun.file(`${import.meta.dir}/${filename}`).text();
      const directOfficialIdGate =
        /if\s*\([\s\S]{0,240}!\s*(?:student|row)\.studentId[\s\S]{0,240}\)/g;

      if (directOfficialIdGate.test(source)) {
        violations.push(filename);
      }
    }

    expect(violations).toEqual([]);
  });
});
