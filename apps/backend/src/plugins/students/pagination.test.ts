import { describe, expect, test } from "bun:test";
import {
  STUDENT_LIST_ORDER_SELECT,
  buildStudentPageFindManyArgs,
} from "./service.ts";

describe("student cursor pagination", () => {
  test("loads the filtered roster with only the fields needed for Khmer ordering", () => {
    const args = buildStudentPageFindManyArgs({
      activeOnly: false,
      limit: 2,
    });

    expect(args).toEqual({
      where: {},
      select: STUDENT_LIST_ORDER_SELECT,
    });
  });

  test("restricts cohort and section before roster paging; closed membership is excluded", () => {
    const cohortId = "11111111-1111-4111-8111-111111111111";
    const sectionId = "22222222-2222-4222-8222-222222222222";
    const args = buildStudentPageFindManyArgs(
      { activeOnly: true, limit: 10, cohortId, sectionId }, ["student-1"],
    );
    expect(args.where).toEqual({
      status: "Active",
      cohortMemberships: { some: { cohortId, exitedAt: null } },
      id: { in: ["student-1"] },
    });
    expect(buildStudentPageFindManyArgs({ activeOnly: false, limit: 10, cohortId, sectionId }).where)
      .toEqual({ cohortMemberships: { some: { cohortId, exitedAt: null } }, id: { in: [] } });
  });

  test("unassigned means no open canonical membership", () => {
    expect(buildStudentPageFindManyArgs({ activeOnly: false, limit: 10, cohortId: "unassigned" }).where)
      .toEqual({ cohortMemberships: { none: { exitedAt: null } } });
  });

  test("applies search and active filters before application-level ordering and paging", () => {
    const cursor = Buffer.from(
      JSON.stringify({ id: "20000000-0000-4000-8000-000000000002" }),
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
        OR: [
          { name: { contains: "DSE", mode: "insensitive" } },
          { email: { contains: "DSE", mode: "insensitive" } },
          { studentId: { contains: "DSE", mode: "insensitive" } },
        ],
      },
      select: STUDENT_LIST_ORDER_SELECT,
    });
  });
});
