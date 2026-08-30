# DSE PMS performance baseline

Parent epic: #736  
Phase issue: #737

## Purpose

Measure DSE PMS latency before changing caching, payloads, pagination, or indexes. Do not optimize from guesses. Keep this evidence reproducible and free of protected payload data.

## Existing instrumentation on `main`

The backend already mounts `createRequestTimingMiddleware()` for `/api` and provides:

- `Server-Timing: app;dur=<milliseconds>` on API responses;
- optional slow-request logs using a normalized route key;
- optional bounded route summaries;
- identifier/query/header/body redaction by construction.

Phase 1 reuses this architecture rather than adding a second request logger.

## Safety rules

Never copy any of the following into benchmark output, issues, PRs, screenshots, or committed files:

- bearer tokens, cookies, auth headers, Supabase service keys;
- request or response bodies;
- student names/IDs/email addresses;
- raw marks/results, sensitive feedback, QA evidence contents, or research participant data;
- database connection strings or SQL parameters containing user data.

The benchmark utilities report only route pathname, status, timing, and response byte count. The database probe runs only `SELECT 1` and prints timings.

## Backend timing configuration

All settings are optional. If unset, the existing request middleware adds `Server-Timing` but does not emit performance summary logs.

```env
PERF_SLOW_REQUEST_MS=300
PERF_SUMMARY_EVERY=100
PERF_SUMMARY_TOP=10
PERF_SUMMARY_MAX_ROUTES=100
```

Recommended production-like measurement window: enable these temporarily on a controlled environment or during an agreed measurement window, then review normalized logs. Do not enable verbose raw SQL/request-body logging.

## HTTP benchmark

From `apps/backend`:

```bash
PERF_BASE_URL=https://<backend-host> \
PERF_BEARER_TOKEN=<temporary-authorized-token> \
PERF_BENCH_RUNS=10 \
bun run performance:http -- /api/auth/me /api/students
```

For public routes, omit `PERF_BEARER_TOKEN`. The tool performs one warm-up request by default and reports request wall-clock p50/p95, backend `Server-Timing` p50/p95 when present, status codes, and average payload bytes. It consumes but never prints response bodies.

Do not benchmark destructive/mutation endpoints. Use GET reads only.

## Backend-to-database round-trip

Run this from the same host/region as the Bun backend with the same `DATABASE_URL` used by that environment:

```bash
PERF_DB_PING_RUNS=10 bun run performance:db
```

The probe measures a read-only `SELECT 1` round trip. It is useful for detecting geographic/network overhead but is not a substitute for profiling real application queries.

## Priority surfaces

Record representative GET routes for these flows. Use the actual authorized route(s) that power the screen and avoid embedding real record identifiers in this document.

| Surface | Cold/warm route set | Requests | Payload | Wall p50/p95 | App p50/p95 | Notes |
| --- | --- | ---: | ---: | --- | --- | --- |
| Dashboard | pending | pending | pending | pending | pending | Current UI aggregates multiple sources |
| Courses | pending | pending | pending | pending | pending | Include list and one authorized detail flow |
| Students | pending | pending | pending | pending | pending | List only; no student-identifiable output committed |
| Offerings | pending | pending | pending | pending | pending | Include normal programme scope |
| AUN-QA / SAR | pending | pending | pending | pending | pending | Read-only live workflow route(s) |
| Student Portal | pending | pending | pending | pending | pending | Test only the authenticated student's own scope |
| Action Research | pending | pending | pending | pending | pending | Read-only assigned/project flow |

Do not replace `pending` with invented numbers. Measurements must come from a production-like run and identify the environment/date/commit.

## Deployment-region audit — 2026-08-29

| Component | Verified state | Evidence / action |
| --- | --- | --- |
| Supabase PostgreSQL | `ap-northeast-1` (Tokyo), project active | Verified through the connected Supabase project metadata; the database contains the core DSE PMS tables. |
| Bun backend API | Region not yet independently verifiable from repository/connected deployment tools | Record the actual backend provider + region before closing #737. Run `performance:db` from that host. |
| Vercel frontend | Production topology is documented, but the currently connected Vercel account exposes no projects | Verify the canonical DSE PMS Vercel project/account and record its production region/configuration if relevant. |

### Topology recommendation

For query-heavy APIs, **backend ↔ PostgreSQL distance is the critical region pairing**. With PostgreSQL currently in Tokyo, prefer hosting the Bun backend in Tokyo or the nearest practical Asia region unless a measured alternative is faster for the programme's real users. Frontend edge delivery can remain geographically distributed; do not move the database or backend based only on assumption—measure first.

## Before/after protocol

For each optimization PR:

1. Record exact base commit and environment.
2. Run the same representative GET set with the same authorization scope.
3. Use the same run/warm-up counts.
4. Record request count, response bytes, wall p50/p95, and backend app p50/p95.
5. For DB-sensitive work, run the DB ping from the backend host and capture relevant normalized slow-route evidence.
6. Apply the change.
7. Repeat the same measurement.
8. Verify authorization and academic-integrity regression tests before claiming improvement.

## Initial budgets from #736

- Cached/revisit render: under 100 ms perceived where practical.
- Normal simple cold screen: under 500 ms target under normal production conditions.
- Simple API: p50 under 150 ms, p95 under 300 ms.
- Heavy dashboard/report: p95 under 500 ms where practical.

These are engineering targets, not guarantees. Adjust only from collected evidence.
