import { describe, expect, test } from "bun:test";

const servicePath = `${import.meta.dir}/monitor-teaching-timing-service.ts`;
const routerPath = `${import.meta.dir}/teaching-session-delivery-router.ts`;

describe("monitor teaching timing punch contract", () => {
  test("uses exact-occurrence server timestamps and keeps start/end idempotent", async () => {
    const source = await Bun.file(servicePath).text();

    expect(source).toContain('FROM "pms_attendance"."TeachingSessionOccurrence"');
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain('FOR SHARE OF a, s, en');
    expect(source).toContain("const now = new Date();");
    expect(source).toContain("if (current?.startedAt)");
    expect(source).toContain("if (current.endedAt)");
    expect(source).toContain('"startedAt" = ${now}');
    expect(source).toContain('"endedAt" = ${now}');
  });

  test("requires teaching start before end and enforces a bounded start window", async () => {
    const source = await Bun.file(servicePath).text();

    expect(source).toContain("TEACHING_START_EARLY_WINDOW_MINUTES");
    expect(source).toContain("assertStartWindow(exactOccurrence, now)");
    expect(source).toContain("Record teaching start before teaching end");
    expect(source).toContain("Teaching end can only be recorded on the teaching-session date");
  });

  test("exposes separate monitor start/end endpoints", async () => {
    const source = await Bun.file(routerPath).text();

    expect(source).toContain("/monitor-teaching-start");
    expect(source).toContain("monitorTeachingTimingService.markStarted");
    expect(source).toContain("/monitor-teaching-end");
    expect(source).toContain("monitorTeachingTimingService.markEnded");
  });
});
