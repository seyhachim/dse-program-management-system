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
