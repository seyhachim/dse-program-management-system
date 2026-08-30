import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./sidebar.tsx", import.meta.url), "utf8");

describe("sidebar route prefetch wiring", () => {
  test("prefetches route and protected data only after authenticated intent", () => {
    expect(source).toContain("if (!me) return");
    expect(source).toContain("protectedRoutePrefetchPlan");
    expect(source).toContain("router.prefetch(routePath)");
    expect(source).toContain("prefetchRouteData(queryClient, plan)");
  });

  test("supports pointer, keyboard focus, and mobile touch intent", () => {
    expect(source).toContain("onPointerEnter");
    expect(source).toContain("onFocus");
    expect(source).toContain("onTouchStart");
  });
});
