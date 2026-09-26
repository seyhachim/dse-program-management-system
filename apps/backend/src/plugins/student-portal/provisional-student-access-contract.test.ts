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

  test("keeps Student Portal attendance provisional-safe across the Offerings boundary", async () => {
    const source = await Bun.file(
      new URL("../offerings/student-attendance-history-service.ts", import.meta.url),
    ).text();

    const portalMethod = source.match(
      /async forPortalUser\([\s\S]*?\n  },\n\n  async forUser/,
    )?.[0];
    const telegramMethod = source.match(
      /async forUser\([\s\S]*?\n  },\n\n  async healthForStudent/,
    )?.[0];

    expect(portalMethod).toBeDefined();
    expect(portalMethod).toContain("requireOfferingEnrollment");
    expect(portalMethod).not.toContain("!student.studentId");

    // Telegram's existing DTO still requires an official student number; keep
    // that contract separate rather than weakening it for the web portal fix.
    expect(telegramMethod).toBeDefined();
    expect(telegramMethod).toContain("!student.studentId");
  });
});
