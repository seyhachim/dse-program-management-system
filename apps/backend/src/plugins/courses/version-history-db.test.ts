import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { courseSpecVersionHistoryService } from "./version-history-service.ts";

const enabled = process.env.COURSE_SPEC_VERSION_HISTORY_DB_TESTS === "1";
const prisma = new PrismaClient();

(enabled ? describe : describe.skip)("course specification exact-version persistence", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("history points to an exact version that can be read without falling through to latest", async () => {
    const seeded = await prisma.courseSpec.findFirst({
      orderBy: [{ courseId: "asc" }, { versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { id: true, courseId: true },
    });
    expect(seeded).not.toBeNull();
    if (!seeded) return;

    const history = await courseSpecVersionHistoryService.history(seeded.courseId);
    const item = history.versions.find((version) => version.id === seeded.id);
    expect(item).toBeDefined();

    const exact = await courseSpecVersionHistoryService.exactVersion(seeded.courseId, seeded.id);
    expect(exact?.version.id).toBe(seeded.id);
    expect(exact?.courseId).toBe(seeded.courseId);

    const same = await courseSpecVersionHistoryService.compare(seeded.courseId, seeded.id, seeded.id);
    expect(same?.changedSectionCount).toBe(0);
    expect(same?.sections.every((section) => !section.changed)).toBe(true);
  });
});
