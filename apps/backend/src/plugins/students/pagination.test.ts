import { describe, expect, test } from "bun:test";
import {
  STUDENT_LIST_SELECT,
  buildStudentPageFindManyArgs,
} from "./service.ts";

describe("student cursor pagination", () => {
  test("requests one look-ahead row with the stable composite ordering", () => {
    const args = buildStudentPageFindManyArgs({
      activeOnly: false,
      limit: 2,
    });

    expect(args).toEqual({
      where: { AND: [] },
      select: STUDENT_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    });
  });

  test("applies filters before the composite cursor boundary", () => {
    const createdAt = new Date("2026-08-30T12:00:00.000Z");
    const cursorId = "20000000-0000-4000-8000-000000000002";
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: createdAt.toISOString(),
        id: cursorId,
      }),
      "utf8",
    ).toString("base64url");

    const args = buildStudentPageFindManyArgs({
      search: "DSE",
      activeOnly: true,
      cursor,
      limit: 10,
    });

    expect(args).toEqual({
      where: {
        status: "Active",
        AND: [
          {
            OR: [
              { name: { contains: "DSE", mode: "insensitive" } },
              { email: { contains: "DSE", mode: "insensitive" } },
              { studentId: { contains: "DSE", mode: "insensitive" } },
            ],
          },
          {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: cursorId } },
            ],
          },
        ],
      },
      select: STUDENT_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 11,
    });
  });
});