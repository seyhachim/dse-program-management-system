import { afterAll, describe, expect, test } from "bun:test";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  createHandbook,
  getHandbook,
  publishHandbook,
  replaceSectionBlocks,
  submitHandbook,
  approveHandbook,
} from "./service.ts";

const describeDb = process.env.STUDENT_HANDBOOK_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

async function fixture() {
  const token = crypto.randomUUID().slice(0, 8);
  const programme = await prisma.programme.create({
    data: { id: `hb-${token}`, code: `HB${token}`, name: `Handbook Programme ${token}` },
  });
  const creator = await prisma.user.create({
    data: { email: `hb-admin-${token}@example.test`, name: `Handbook Admin ${token}` },
  });
  const lecturer = await prisma.user.create({
    data: { email: `hb-lecturer-${token}@example.test`, name: `Handbook Lecturer ${token}` },
  });
  const lecturerRole = await prisma.role.findUniqueOrThrow({ where: { slug: "lecturer" } });
  await prisma.userRoleAssignment.create({
    data: { userId: lecturer.id, roleId: lecturerRole.id, programmeId: programme.id },
  });
  return { token, programme, creator, lecturer };
}

describeDb("student handbook service", () => {
  test("creates one-owner handbook and saves narrative plus read-only source reference", async () => {
    const f = await fixture();
    const handbook = await createHandbook(
      {
        programmeId: f.programme.id,
        assignedLecturerId: f.lecturer.id,
        version: "2026.1",
        title: "Student Handbook",
      },
      f.creator.id,
    );

    expect(handbook.assignedLecturer.id).toBe(f.lecturer.id);
    expect(handbook.sections).toHaveLength(10);

    const saved = await replaceSectionBlocks(
      handbook.id,
      "study-plan",
      {
        blocks: [
          { type: "NARRATIVE", content: "Follow the approved study plan." },
          { type: "SOURCE_DATA", sourceKind: "CURRICULUM_SUMMARY" },
        ],
      },
      f.lecturer.id,
    );
    const section = saved.sections.find((row) => row.key === "study-plan");
    expect(section?.blocks.map((row) => row.type)).toEqual(["NARRATIVE", "SOURCE_DATA"]);
  });

  test("workflow reaches approved before publication", async () => {
    const f = await fixture();
    const handbook = await createHandbook(
      {
        programmeId: f.programme.id,
        assignedLecturerId: f.lecturer.id,
        version: "2026.2",
        title: "Student Handbook",
      },
      f.creator.id,
    );
    expect((await submitHandbook(handbook.id, f.lecturer.id)).status).toBe("SUBMITTED");
    expect((await approveHandbook(handbook.id, f.creator.id, "Reviewed")).status).toBe("APPROVED");
  });

  test("published rows reject later content mutation at the database boundary", async () => {
    const f = await fixture();
    const handbook = await createHandbook(
      {
        programmeId: f.programme.id,
        assignedLecturerId: f.lecturer.id,
        version: "2026.3",
        title: "Student Handbook",
      },
      f.creator.id,
    );
    await replaceSectionBlocks(
      handbook.id,
      "welcome",
      { blocks: [{ type: "NARRATIVE", content: "Welcome." }] },
      f.lecturer.id,
    );
    await submitHandbook(handbook.id, f.lecturer.id);
    await approveHandbook(handbook.id, f.creator.id, "Approved");

    // No SOURCE_DATA block is present, so publish does not depend on a programme public-read fixture.
    expect((await publishHandbook(handbook.id, f.creator.id, "Publish")).status).toBe("PUBLISHED");

    await expect(
      prisma.$executeRaw(Prisma.sql`
        UPDATE student_handbook."StudentHandbookSection"
        SET "title" = 'Changed after publication'
        WHERE "handbookId" = ${handbook.id}
      `),
    ).rejects.toThrow(/immutable/i);

    expect((await getHandbook(handbook.id)).status).toBe("PUBLISHED");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
