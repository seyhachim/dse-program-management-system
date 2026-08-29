import { prisma } from "../src/core/db/prisma.ts";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const runs = parsePositiveInteger(process.env.PERF_DB_PING_RUNS, 10);
const warmups = parsePositiveInteger(process.env.PERF_DB_PING_WARMUPS, 1);

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function ping(): Promise<number> {
  const startedAt = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return Math.max(0, performance.now() - startedAt);
}

try {
  for (let i = 0; i < warmups; i += 1) {
    await ping();
  }

  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    samples.push(await ping());
  }

  console.log(
    [
      "[perf] database-round-trip",
      `runs=${runs}`,
      `p50=${percentile(samples, 0.5).toFixed(1)}ms`,
      `p95=${percentile(samples, 0.95).toFixed(1)}ms`,
      `avg=${average(samples).toFixed(1)}ms`,
      `min=${Math.min(...samples).toFixed(1)}ms`,
      `max=${Math.max(...samples).toFixed(1)}ms`,
    ].join(" "),
  );
} finally {
  await prisma.$disconnect();
}
