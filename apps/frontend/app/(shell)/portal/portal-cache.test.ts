import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

async function source(path: string) {
  return readFile(join(here, path), "utf8");
}

describe("student portal mobile cache", () => {
  test("keeps authenticated portal cache user-scoped and in-memory", async () => {
    const state = await source("portal-state.tsx");

    expect(state).toContain("useQuery");
    expect(state).toContain("protectedQueryKey");
    expect(state).toContain('`student-portal-${resource}`');
    expect(state).toContain("Boolean(me?.id)");
    expect(state).not.toContain("localStorage");
    expect(state).not.toContain("sessionStorage");
    expect(state).not.toContain("caches.open");
  });

  test("home renders cached data during refresh and warms likely next reads", async () => {
    const home = await source("portal-home.tsx");

    expect(home).toContain('useCachedPortalData(\n    "home"');
    expect(home).toContain("usePortalPrefetch(HOME_PREFETCH)");
    expect(home).toContain('{ resource: "courses"');
    expect(home).toContain('{ resource: "announcements"');
    expect(home).toContain('{ resource: "assessments"');
    expect(home).toContain('{ resource: "academic-calendar"');
    expect(home).toContain("Showing your last available portal data");
    expect(home).toContain("Updating your portal…");
    expect(home).not.toContain("usePortalData(load)");
  });

  test("prefetched destinations reuse the exact protected resource keys", async () => {
    const checks = [
      ["courses/portal-courses.tsx", 'useCachedPortalData("courses", load)'],
      [
        "announcements/portal-announcements.tsx",
        'useCachedPortalData("announcements", load)',
      ],
      [
        "assessments/portal-assessments.tsx",
        'useCachedPortalData("assessments", load)',
      ],
      [
        "academic-calendar/portal-academic-calendar.tsx",
        'useCachedPortalData("academic-calendar", load)',
      ],
    ] as const;

    for (const [path, marker] of checks) {
      expect(await source(path)).toContain(marker);
    }
  });
});
