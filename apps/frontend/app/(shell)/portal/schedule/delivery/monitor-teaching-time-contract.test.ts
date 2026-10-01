import { describe, expect, test } from "bun:test";

const cardPath = `${import.meta.dir}/monitor-teaching-time-card.tsx`;
const formPath = `${import.meta.dir}/monitor-delivery-form.tsx`;

describe("monitor teaching timing UI contract", () => {
  test("uses explicit server start/end actions", async () => {
    const source = await Bun.file(cardPath).text();

    expect(source).toContain("markTeachingStarted");
    expect(source).toContain("markTeachingEnded");
    expect(source).toContain("Start class");
    expect(source).toContain("End class");
  });

  test("does not silently prefill new actual times from the scheduled meeting", async () => {
    const source = await Bun.file(formPath).text();

    expect(source).toContain("context.timing?.startedAt");
    expect(source).toContain("context.timing?.endedAt");
    expect(source).not.toContain("actualStartTime: context.occurrence.scheduledStartTime");
    expect(source).not.toContain("actualEndTime: context.occurrence.scheduledEndTime");
    expect(source).not.toContain('actualTopic: context.plannedWeek?.topic ?? ""');
    expect(source).toContain("context.eligibleLecturers.length === 1");
    expect(source).toContain("Correct time");
  });
});


describe("monitor delivery UX contract", () => {
  test("puts class status first and removes lecturer arrival check-in", async () => {
    const source = await Bun.file(formPath).text();

    expect(source).not.toContain("MonitorArrivalCard");
    expect(source).not.toContain("refreshArrival");
    expect(source).toContain("Was this class held?");
    expect(source).toContain("Planned topic · Week");
    expect(source.indexOf("Was this class held?")).toBeLessThan(
      source.indexOf("Planned topic · Week"),
    );
  });

  test("keeps the monitor form concise", async () => {
    const source = await Bun.file(formPath).text();

    expect(source).toContain("Was this class held?");
    expect(source).toContain("Topic taught");
    expect(source).toContain("Learning note");
    expect(source).toContain("More details");
    expect(source).toContain('{saving ? "Saving…" : "Save"}');
    expect(source).not.toContain("Confirm what happened in this class");
    expect(source).not.toContain("Record the session clearly and factually.");
    expect(source).not.toContain("Selected automatically");
    expect(source).not.toContain("Required for every class that was held.");
    expect(source).not.toContain("Delivery history");
    expect(source).not.toContain("Held as scheduled");
  });

  test("keeps taught topic required and learning summary optional", async () => {
    const source = await Bun.file(formPath).text();

    expect(source).toContain("Topic taught");
    expect(source).toContain("Topic taught is required.");
    expect(source).toContain("Learning note");
    expect(source).toContain("(optional)");
  });
});
