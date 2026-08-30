const baseUrl = process.env.PERF_BASE_URL?.trim().replace(/\/+$/, "");
const bearerToken = process.env.PERF_BEARER_TOKEN?.trim();

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const runs = parsePositiveInteger(process.env.PERF_BENCH_RUNS, 10);
const warmups = parsePositiveInteger(process.env.PERF_BENCH_WARMUPS, 1);
const paths = process.argv.slice(2);

if (!baseUrl || paths.length === 0) {
  console.error(
    "Usage: PERF_BASE_URL=https://backend.example PERF_BEARER_TOKEN=<optional> bun scripts/performance-benchmark.ts /api/path [/api/other]",
  );
  process.exit(1);
}

const base = new URL(baseUrl);

type Sample = {
  totalMs: number;
  appMs: number | null;
  bytes: number;
  status: number;
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseAppTiming(header: string | null): number | null {
  if (!header) return null;
  const match = header.match(/(?:^|,)\s*app;dur=([0-9]+(?:\.[0-9]+)?)/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}ms`;
}

function safeTarget(path: string): { url: URL; label: string } {
  if (!path.startsWith("/")) {
    throw new Error(`Benchmark paths must start with '/': ${path}`);
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error("Benchmark path must stay on PERF_BASE_URL origin");
  }
  return { url, label: url.pathname };
}

async function measure(url: URL): Promise<Sample> {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "GET",
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
  });
  const body = await response.arrayBuffer();
  return {
    totalMs: Math.max(0, performance.now() - startedAt),
    appMs: parseAppTiming(response.headers.get("server-timing")),
    bytes: body.byteLength,
    status: response.status,
  };
}

for (const path of paths) {
  const { url, label } = safeTarget(path);

  for (let i = 0; i < warmups; i += 1) {
    await measure(url);
  }

  const samples: Sample[] = [];
  for (let i = 0; i < runs; i += 1) {
    samples.push(await measure(url));
  }

  const statuses = [...new Set(samples.map((sample) => sample.status))].sort((a, b) => a - b);
  const total = samples.map((sample) => sample.totalMs);
  const app = samples.flatMap((sample) => (sample.appMs === null ? [] : [sample.appMs]));
  const bytes = samples.map((sample) => sample.bytes);

  console.log(
    [
      `[perf] ${label}`,
      `runs=${runs}`,
      `status=${statuses.join(",")}`,
      `total-p50=${formatMetric(percentile(total, 0.5))}`,
      `total-p95=${formatMetric(percentile(total, 0.95))}`,
      `total-avg=${formatMetric(average(total))}`,
      `app-p50=${formatMetric(percentile(app, 0.5))}`,
      `app-p95=${formatMetric(percentile(app, 0.95))}`,
      `bytes-avg=${Math.round(average(bytes) ?? 0)}`,
    ].join(" "),
  );
}
