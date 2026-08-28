import type { NextFunction, Request, Response } from "express";

type EndArgs = [
  chunk?: string | Buffer | Uint8Array,
  encoding?: BufferEncoding,
  callback?: () => void,
];

type RouteTimingStats = {
  count: number;
  totalMs: number;
  maxMs: number;
};

export interface RequestTimingOptions {
  now?: () => number;
  slowRequestMs?: number | null;
  summaryEvery?: number | null;
  summaryTop?: number;
  maxRoutes?: number;
  log?: (message: string) => void;
}

export function parseSlowRequestThreshold(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parsePositiveInteger(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function formatServerTiming(durationMs: number): string {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  return `app;dur=${safeDuration.toFixed(1)}`;
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const OPAQUE_ID_SEGMENT = /^[A-Za-z0-9_-]{20,}$/;

/**
 * Converts request paths into bounded, privacy-safe route keys. Dynamic record
 * identifiers are deliberately removed before any performance log is emitted.
 */
export function normalizePerformancePath(path: string): string {
  const normalized = path
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) || OPAQUE_ID_SEGMENT.test(segment)) {
        return ":id";
      }
      return segment;
    })
    .join("/");
  return normalized || "/";
}

function requestPath(req: Request): string {
  return normalizePerformancePath(`${req.baseUrl}${req.path}` || "/");
}

function formatSummary(
  requestCount: number,
  stats: Map<string, RouteTimingStats>,
  top: number,
): string {
  const ranked = [...stats.entries()]
    .map(([route, value]) => ({
      route,
      count: value.count,
      averageMs: value.totalMs / value.count,
      maxMs: value.maxMs,
    }))
    .sort((a, b) => b.averageMs - a.averageMs || b.maxMs - a.maxMs || b.count - a.count)
    .slice(0, top)
    .map((item) => `${item.route} count=${item.count} avg=${item.averageMs.toFixed(1)}ms max=${item.maxMs.toFixed(1)}ms`)
    .join(" | ");

  return `[perf] summary requests=${requestCount}${ranked ? ` | ${ranked}` : ""}`;
}

/**
 * Adds low-overhead API timing without changing response bodies or authorization.
 * Performance logs deliberately include only method, normalized path, status, and
 * elapsed time. Query strings, raw record IDs, tokens, request bodies, user data,
 * and academic payloads never become performance-log fields.
 */
export function createRequestTimingMiddleware(options: RequestTimingOptions = {}) {
  const now = options.now ?? performance.now.bind(performance);
  const slowRequestMs = options.slowRequestMs === undefined
    ? parseSlowRequestThreshold(process.env.PERF_SLOW_REQUEST_MS)
    : options.slowRequestMs;
  const summaryEvery = options.summaryEvery === undefined
    ? parsePositiveInteger(process.env.PERF_SUMMARY_EVERY)
    : options.summaryEvery;
  const summaryTop = options.summaryTop ?? parsePositiveInteger(process.env.PERF_SUMMARY_TOP) ?? 10;
  const maxRoutes = options.maxRoutes ?? parsePositiveInteger(process.env.PERF_SUMMARY_MAX_ROUTES) ?? 100;
  const log = options.log ?? console.warn;
  const routeStats = new Map<string, RouteTimingStats>();
  let measuredRequests = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = now();
    const originalEnd = res.end.bind(res) as (...args: EndArgs) => Response;
    let measured = false;

    res.end = ((...args: EndArgs) => {
      if (!measured) {
        measured = true;
        const durationMs = Math.max(0, now() - startedAt);
        const path = requestPath(req);

        if (!res.headersSent && !res.hasHeader("Server-Timing")) {
          res.setHeader("Server-Timing", formatServerTiming(durationMs));
        }

        if (slowRequestMs !== null && durationMs >= slowRequestMs) {
          log(`[perf] slow request ${req.method} ${path} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
        }

        if (summaryEvery !== null) {
          measuredRequests += 1;
          const route = `${req.method} ${path}`;
          const existing = routeStats.get(route);
          if (existing) {
            existing.count += 1;
            existing.totalMs += durationMs;
            existing.maxMs = Math.max(existing.maxMs, durationMs);
          } else if (routeStats.size < maxRoutes) {
            routeStats.set(route, { count: 1, totalMs: durationMs, maxMs: durationMs });
          } else {
            const overflow = routeStats.get("OTHER") ?? { count: 0, totalMs: 0, maxMs: 0 };
            overflow.count += 1;
            overflow.totalMs += durationMs;
            overflow.maxMs = Math.max(overflow.maxMs, durationMs);
            routeStats.set("OTHER", overflow);
          }

          if (measuredRequests >= summaryEvery) {
            log(formatSummary(measuredRequests, routeStats, summaryTop));
            measuredRequests = 0;
            routeStats.clear();
          }
        }
      }

      return originalEnd(...args);
    }) as Response["end"];

    next();
  };
}
