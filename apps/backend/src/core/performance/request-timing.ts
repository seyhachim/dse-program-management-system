import type { NextFunction, Request, Response } from "express";

type EndArgs = [
  chunk?: string | Buffer | Uint8Array,
  encoding?: BufferEncoding,
  callback?: () => void,
];

export interface RequestTimingOptions {
  now?: () => number;
  slowRequestMs?: number | null;
  log?: (message: string) => void;
}

export function parseSlowRequestThreshold(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function formatServerTiming(durationMs: number): string {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  return `app;dur=${safeDuration.toFixed(1)}`;
}

function requestPath(req: Request): string {
  return `${req.baseUrl}${req.path}` || "/";
}

/**
 * Adds low-overhead API timing without changing response bodies or authorization.
 * Slow logs deliberately include only method, path (without query string), status,
 * and elapsed time so tokens, user identifiers, request bodies, and academic data
 * never become performance-log fields.
 */
export function createRequestTimingMiddleware(options: RequestTimingOptions = {}) {
  const now = options.now ?? performance.now.bind(performance);
  const slowRequestMs = options.slowRequestMs === undefined
    ? parseSlowRequestThreshold(process.env.PERF_SLOW_REQUEST_MS)
    : options.slowRequestMs;
  const log = options.log ?? console.warn;

  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = now();
    const originalEnd = res.end.bind(res) as (...args: EndArgs) => Response;
    let measured = false;

    res.end = ((...args: EndArgs) => {
      if (!measured) {
        measured = true;
        const durationMs = Math.max(0, now() - startedAt);

        if (!res.headersSent && !res.hasHeader("Server-Timing")) {
          res.setHeader("Server-Timing", formatServerTiming(durationMs));
        }

        if (slowRequestMs !== null && durationMs >= slowRequestMs) {
          log(
            `[perf] slow request ${req.method} ${requestPath(req)} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
          );
        }
      }

      return originalEnd(...args);
    }) as Response["end"];

    next();
  };
}
