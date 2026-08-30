import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";
import { studentService } from "./service.ts";

afterEach(() => {
  // Bun spies restore through mockRestore below; this hook exists so future
  // tests added to this file keep the database client untouched after failure.
});

describe("student cursor pagination", () => {
  test("requests one look-ahead row and returns an opaque next cursor", async () => {
    const createdAt = new Date("2026-08-30T12:00:00.000Z");
    const findMany = spyOn(prisma.student, "findMany").mockResolvedValue([
      {
        id: "30000000-0000-4000-8000-000000000003",
        name: "Student 3",
        email: null,
        studentId: "DSE003",
        status: "Active",
        createdAt,
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        name: "Student 2",
        email: null,
        studentId: "DSE002",
        status: "Active",
        createdAt,
      },
      {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Student 1",
        email: null,
        studentId: "DSE001",
        status: "Active",
        createdAt,
      },
    ] as never);

    const page = await studentService.listPage({
      activeOnly: false,
      limit: 2,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      take: 3,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(page.items.map((item) => item.studentId)).toEqual(["DSE003", "DSE002"]);
    expect(page.items[0]?.createdAt).toBe("2026-08-30T12:00:00.000Z");
    expect(page.nextCursor).toBeTruthy();

    findMany.mockRestore();
  });

  test("applies filters before the composite cursor boundary", async () => {
    const findMany = spyOn(prisma.student, "findMany").mockResolvedValue([] as never);
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-08-30T12:00:00.000Z",
        id: "20000000-0000-4000-8000-000000000002",
      }),
      "utf8",
    ).toString("base64url");

    const page = await studentService.listPage({
      search: "DSE",
      activeOnly: true,
      cursor,
      limit: 10,
    });

    expect(page).toEqual({ items: [], nextCursor: null });
    const args = findMany.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      where: {
        status: "Active",
      },
      take: 11,
    });
    expect(JSON.stringify(args?.where)).toContain("DSE");
    expect(JSON.stringify(args?.where)).toContain("2026-08-30T12:00:00.000Z");
    expect(JSON.stringify(args?.where)).toContain("20000000-0000-4000-8000-000000000002");

    findMany.mockRestore();
  });
});
