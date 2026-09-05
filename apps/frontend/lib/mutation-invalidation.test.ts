import { describe, expect, test } from "bun:test";
import {
  invalidationForSuccessfulMutation,
  runConfirmedMutation,
  subscribeConfirmedMutation,
} from "./mutation-invalidation";

describe("mutation invalidation registry", () => {
  test("maps student writes to students and dashboard", () => {
    expect(
      invalidationForSuccessfulMutation("PATCH", "/api/students/student-1/status"),
    ).toMatchObject({
      domain: "students",
      resources: ["students", "dashboard"],
    });
  });

  test("maps CourseSpec lifecycle writes before the generic course rule", () => {
    expect(
      invalidationForSuccessfulMutation(
        "POST",
        "/api/courses/course-1/spec/review/approve",
      ),
    ).toMatchObject({
      domain: "course-spec",
      resources: ["course-spec", "courses", "dashboard"],
    });
  });

  test("maps CourseSpec section saves to the live editor cache", () => {
    expect(
      invalidationForSuccessfulMutation(
        "PUT",
        "/api/courses/course-1/spec/courseInfo",
      ),
    ).toMatchObject({
      domain: "course-spec",
      resources: ["course-spec", "courses", "dashboard"],
    });
  });

  test("refreshes CourseSpec after confirmed assessment-template metadata writes", () => {
    expect(
      invalidationForSuccessfulMutation(
        "PUT",
        "/api/assessment-template/course-1",
      ),
    ).toMatchObject({
      domain: "course-spec",
      resources: ["course-spec"],
    });
  });

  test("distinguishes offering enrollment from structural writes", () => {
    expect(
      invalidationForSuccessfulMutation(
        "POST",
        "/api/offerings/offering-1/enrollments",
      ),
    ).toMatchObject({ resources: ["offerings", "dashboard"] });
    expect(
      invalidationForSuccessfulMutation("PATCH", "/api/offerings/offering-1"),
    ).toMatchObject({ resources: ["offerings", "courses", "dashboard"] });
  });

  test("does not broadly invalidate offering reads for attendance writes", () => {
    expect(
      invalidationForSuccessfulMutation(
        "PUT",
        "/api/offerings/offering-1/attendance/2026-08-30",
      ),
    ).toBeNull();
  });

  test("maps calendar publication without targeting immutable resources", () => {
    expect(
      invalidationForSuccessfulMutation(
        "POST",
        "/api/programme/dse/academic-calendar/calendar-1/publish",
      ),
    ).toMatchObject({
      domain: "academic-calendar",
      resources: ["academic-calendar"],
    });
  });

  test("maps result save, publish, finalize, and correction routes", () => {
    for (const path of [
      "/api/student-portal/manage/results",
      "/api/student-portal/manage/results/publish",
      "/api/student-portal/manage/results/finalize",
      "/api/student-portal/manage/results/correct",
    ]) {
      expect(invalidationForSuccessfulMutation("POST", path)).toMatchObject({
        domain: "results",
        resources: ["results"],
      });
    }
  });

  test("classifies QA/SAR and QA-mounted Action Research separately", () => {
    expect(
      invalidationForSuccessfulMutation("POST", "/api/qa/sar-book/cycles/cycle-1/release"),
    ).toMatchObject({ domain: "qa-sar", resources: ["qa"] });
    expect(
      invalidationForSuccessfulMutation(
        "PATCH",
        "/api/qa/action-research/projects/project-1/review",
      ),
    ).toMatchObject({
      domain: "action-research",
      resources: ["action-research"],
    });
  });

  test("does not classify the obsolete unmounted Action Research prefix", () => {
    expect(
      invalidationForSuccessfulMutation(
        "PATCH",
        "/api/action-research/projects/project-1/review",
      ),
    ).toBeNull();
  });

  test("does not classify unrelated authenticated mutations", () => {
    expect(
      invalidationForSuccessfulMutation("POST", "/api/auth/change-password"),
    ).toBeNull();
  });
});

describe("confirmed mutation boundary", () => {
  test("emits once after a confirmed successful write", async () => {
    const events: string[] = [];
    const unsubscribe = subscribeConfirmedMutation((event) => {
      events.push(`${event.method} ${event.invalidation.domain}`);
    });

    try {
      await expect(
        runConfirmedMutation("POST", "/api/students", async () => ({ id: "s1" })),
      ).resolves.toEqual({ id: "s1" });
      expect(events).toEqual(["POST students"]);
    } finally {
      unsubscribe();
    }
  });

  test("does not emit when the server mutation rejects", async () => {
    const events: string[] = [];
    const unsubscribe = subscribeConfirmedMutation((event) => {
      events.push(event.invalidation.domain);
    });

    try {
      await expect(
        runConfirmedMutation("POST", "/api/students", async () => {
          throw new Error("server rejected write");
        }),
      ).rejects.toThrow("server rejected write");
      expect(events).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});
