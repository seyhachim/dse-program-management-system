import { expect, test } from "bun:test";

test("my-work projects current cycle stage in the joined read instead of per-row lookups", async () => {
  const source = await Bun.file(new URL("./my-work.ts", import.meta.url)).text();

  expect(source).toContain('AS "currentStage"');
  expect(source).toContain('WHERE c."projectId" = p."id"');
  expect(source).toContain('ORDER BY c."cycleNumber" DESC');
  expect(source).not.toContain("currentCycleRow(");
  expect(source).not.toContain("Promise.all(rows.map");
});
