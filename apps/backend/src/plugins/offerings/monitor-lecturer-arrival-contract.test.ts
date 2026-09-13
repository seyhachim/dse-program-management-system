import { describe, expect, test } from "bun:test";

const servicePath = `${import.meta.dir}/monitor-lecturer-arrival-service.ts`;
const routerPath = `${import.meta.dir}/teaching-session-delivery-router.ts`;

describe("monitor lecturer arrival punch contract", () => {
  test("uses an exact-occurrence server timestamp and preserves an existing Present punch", async () => {
    const source = await Bun.file(servicePath).text();

    expect(source).toContain('WHERE "id" = ${occurrence.id}');
    expect(source).toContain('FOR SHARE OF a, s, en');
    expect(source).toContain('if (current?.status === "Present")');
    expect(source).toContain('const now = new Date();');
    expect(source).toContain('"recordedAt" = ${now}');
    expect(source).toContain("'Present', '', ${userId}, ${now}, ${now}");
  });

  test("keeps class learning saves from rewriting lecturer arrival", async () => {
    const source = await Bun.file(routerPath).text();

    expect(source).toContain('/monitor-arrival');
    expect(source).toContain('monitorLecturerArrivalService.markArrived');
    expect(source).toContain('{ ...body.data, lecturerArrivalStatus: null }');
  });
});
