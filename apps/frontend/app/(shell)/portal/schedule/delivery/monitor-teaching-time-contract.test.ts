import { describe, expect, test } from "bun:test";

const cardPath = `${import.meta.dir}/monitor-teaching-time-card.tsx`;
const formPath = `${import.meta.dir}/monitor-delivery-form.tsx`;

describe("monitor teaching timing UI contract", () => {
  test("uses explicit server start/end actions", async () => {
    const source = await Bun.file(cardPath).text();

    expect(source).toContain("markTeachingStarted");
    expect(source).toContain("markTeachingEnded");
    expect(source).toContain("Start teaching now");
    expect(source).toContain("End teaching now");
    expect(source).toContain("Server timestamps are preserved");
  });

  test("does not silently prefill new actual times from the scheduled meeting", async () => {
    const source = await Bun.file(formPath).text();

    expect(source).toContain("context.timing?.startedAt");
    expect(source).toContain("context.timing?.endedAt");
    expect(source).not.toContain("actualStartTime: context.occurrence.scheduledStartTime");
    expect(source).not.toContain("actualEndTime: context.occurrence.scheduledEndTime");
    expect(source).toContain("audited delivery revision history");
  });
});
