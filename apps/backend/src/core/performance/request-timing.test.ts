import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createRequestTimingMiddleware,
  formatServerTiming,
  normalizePerformancePath,
  parsePositiveInteger,
  parseSlowRequestThreshold,
} from "./request-timing";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

async function startTestServer(options?: Parameters<typeof createRequestTimingMiddleware>[0]) {
  const app = express();
  app.use("/api", createRequestTimingMiddleware(options));
  app.get("/api/example", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/api/students/:id", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/api/courses/:id", (_req, res) => res.status(200).json({ ok: true }));

  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("request timing", () => {
  test("parses only positive finite slow-request thresholds", () => {
    expect(parseSlowRequestThreshold(undefined)).toBeNull();
    expect(parseSlowRequestThreshold("")).toBeNull();
    expect(parseSlowRequestThreshold("0")).toBeNull();
    expect(parseSlowRequestThreshold("-1")).toBeNull();
    expect(parseSlowRequestThreshold("abc")).toBeNull();
    expect(parseSlowRequestThreshold("250")).toBe(250);
  });

  test("parses only positive safe integers for summary controls", () => {
    expect(parsePositiveInteger(undefined)).toBeNull();
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger("abc")).toBeNull();
    expect(parsePositiveInteger("25")).toBe(25);
  });

  test("formats a stable Server-Timing metric", () => {
    expect(formatServerTiming(12.345)).toBe("app;dur=12.3");
    expect(formatServerTiming(-3)).toBe("app;dur=0.0");
  });

  test("normalizes dynamic record identifiers without changing stable route text", () => {
    expect(normalizePerformancePath("/api/students/17")).toBe("/api/students/:id");
    expect(normalizePerformancePath("/api/students/60f3cf56-62f0-4c14-a827-9af7657389f8/results")).toBe("/api/students/:id/results");
    expect(normalizePerformancePath("/api/items/cuidlikeidentifier1234567890")).toBe("/api/items/:id");
    expect(normalizePerformancePath("/api/calendar/dse/2026-2027/year-4")).toBe("/api/calendar/dse/2026-2027/year-4");
    expect(normalizePerformancePath("/api/programme-public-information/settings")).toBe("/api/programme-public-information/settings");
  });

  test("adds Server-Timing to API responses", async () => {
    let tick = 0;
    const baseUrl = await startTestServer({
      now: () => {
        tick += 8;
        return tick;
      },
      slowRequestMs: null,
      summaryEvery: null,
    });

    const response = await fetch(`${baseUrl}/api/example`);
    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toBe("app;dur=8.0");
    expect(await response.json()).toEqual({ ok: true });
  });

  test("slow logging excludes query values, identifiers, and request data", async () => {
    const messages: string[] = [];
    let tick = 0;
    const baseUrl = await startTestServer({
      now: () => {
        tick += 10;
        return tick;
      },
      slowRequestMs: 5,
      summaryEvery: null,
      log: (message) => messages.push(message),
    });

    const studentId = "60f3cf56-62f0-4c14-a827-9af7657389f8";
    await fetch(`${baseUrl}/api/students/${studentId}?token=super-secret&studentId=private-value`, {
      headers: { Authorization: "Bearer should-not-appear" },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("GET /api/students/:id 200 10.0ms");
    expect(messages[0]).not.toContain(studentId);
    expect(messages[0]).not.toContain("super-secret");
    expect(messages[0]).not.toContain("private-value");
    expect(messages[0]).not.toContain("should-not-appear");
  });

  test("emits a ranked summary and resets the reporting window", async () => {
    const messages: string[] = [];
    let tick = 0;
    const baseUrl = await startTestServer({
      now: () => {
        tick += 5;
        return tick;
      },
      slowRequestMs: null,
      summaryEvery: 3,
      summaryTop: 2,
      maxRoutes: 3,
      log: (message) => messages.push(message),
    });

    await fetch(`${baseUrl}/api/example`);
    await fetch(`${baseUrl}/api/students/1`);
    await fetch(`${baseUrl}/api/students/2`);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("[perf] summary requests=3");
    expect(messages[0]).toContain("GET /api/students/:id count=2 avg=5.0ms max=5.0ms");
    expect(messages[0]).toContain("GET /api/example count=1 avg=5.0ms max=5.0ms");
    expect(messages[0]).not.toContain("/students/1");
    expect(messages[0]).not.toContain("/students/2");

    await fetch(`${baseUrl}/api/example`);
    await fetch(`${baseUrl}/api/example`);
    expect(messages).toHaveLength(1);
    await fetch(`${baseUrl}/api/example`);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("GET /api/example count=3");
  });

  test("keeps route-cardinality within the configured bound", async () => {
    const messages: string[] = [];
    let tick = 0;
    const baseUrl = await startTestServer({
      now: () => {
        tick += 2;
        return tick;
      },
      slowRequestMs: null,
      summaryEvery: 3,
      summaryTop: 5,
      maxRoutes: 2,
      log: (message) => messages.push(message),
    });

    await fetch(`${baseUrl}/api/example`);
    await fetch(`${baseUrl}/api/students/1`);
    await fetch(`${baseUrl}/api/courses/1`);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("GET /api/example count=1");
    expect(messages[0]).toContain("OTHER count=2");
  });
});
