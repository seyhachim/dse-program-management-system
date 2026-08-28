import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createRequestTimingMiddleware,
  formatServerTiming,
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

  test("formats a stable Server-Timing metric", () => {
    expect(formatServerTiming(12.345)).toBe("app;dur=12.3");
    expect(formatServerTiming(-3)).toBe("app;dur=0.0");
  });

  test("adds Server-Timing to API responses", async () => {
    let tick = 0;
    const baseUrl = await startTestServer({
      now: () => {
        tick += 8;
        return tick;
      },
      slowRequestMs: null,
    });

    const response = await fetch(`${baseUrl}/api/example`);
    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toBe("app;dur=8.0");
    expect(await response.json()).toEqual({ ok: true });
  });

  test("slow logging excludes query values and request data", async () => {
    const messages: string[] = [];
    let tick = 0;
    const baseUrl = await startTestServer({
      now: () => {
        tick += 10;
        return tick;
      },
      slowRequestMs: 5,
      log: (message) => messages.push(message),
    });

    await fetch(`${baseUrl}/api/example?token=super-secret&studentId=private-value`, {
      headers: { Authorization: "Bearer should-not-appear" },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("GET /api/example 200 10.0ms");
    expect(messages[0]).not.toContain("super-secret");
    expect(messages[0]).not.toContain("private-value");
    expect(messages[0]).not.toContain("should-not-appear");
  });
});
