import { describe, expect, test } from "bun:test";
import { listLecturerPortfolioItems } from "./portfolio-service.ts";

const owner = "owner-a";
const timestamp = new Date("2026-11-20T00:00:00.000Z");

function item(id: string) {
  return {
    id, lecturerId: owner, kind: "Publication", title: id, organization: "DSE",
    description: "", role: "", identifier: "", url: "", startDate: null, endDate: null,
    tags: [], isPublic: false, isFeatured: false, verificationStatus: "SelfDeclared",
    createdAt: timestamp, updatedAt: timestamp,
  };
}

function event(id: string, itemId: string, action: "Verified" | "Reset" | "Rejected") {
  return { id, itemId, action, note: id, actorId: "reviewer", actorName: "Reviewer", createdAt: timestamp };
}

function fixture(rows: ReturnType<typeof item>[], events: ReturnType<typeof event>[]) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  // Only the raw-read dependency is substituted. The real list implementation
  // still builds its SQL, groups histories and serializes the API payload.
  const db = {
    $queryRaw(sql: TemplateStringsArray, ...parameters: unknown[]) {
      calls.push({ sql: sql.join("?"), parameters });
      return Promise.resolve(calls.length === 1 ? rows : events);
    },
  } as unknown as Parameters<typeof listLecturerPortfolioItems>[0];
  return { db, calls };
}

describe("lecturer portfolio list query budget (#736)", () => {
  test.each([1, 50, 100])("uses two queries for %i portfolio items", async (count) => {
    const items = Array.from({ length: count }, (_, i) => item("item-" + i));
    const { db, calls } = fixture(items, items.map(row => event("review-" + row.id, row.id, "Verified")));
    const result = await listLecturerPortfolioItems(db, owner);
    expect(result.map(row => row.id)).toEqual(items.map(row => row.id));
    expect(result.every(row => row.verificationEvents.length === 1)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.map(call => call.parameters)).toEqual([[owner], [owner]]);
    expect(calls[1]!.sql).toContain('JOIN lecturer_portfolio."LecturerPortfolioItem" i ON i."id" = v."itemId"');
    expect(calls[1]!.sql).toContain('WHERE i."lecturerId" = ?');
    expect(calls[1]!.sql).toContain('ORDER BY v."itemId" ASC, v."createdAt" ASC, v."id" ASC');
  });

  test("empty list skips the history query", async () => {
    const { db, calls } = fixture([], []);
    expect(await listLecturerPortfolioItems(db, owner)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test("preserves item and history order, audit fields and empty histories; ignores unmatched event rows", async () => {
    const rows = [item("b"), item("a"), item("c")];
    const events = [
      event("e1", "a", "Verified"), event("e2", "a", "Reset"),
      event("e3", "b", "Rejected"), event("foreign", "other-owner-item", "Verified"),
    ];
    const { db } = fixture(rows, events);
    const result = await listLecturerPortfolioItems(db, owner);
    expect(result.map(row => row.id)).toEqual(["b", "a", "c"]);
    expect(result[0]!.verificationEvents.map(e => e.action)).toEqual(["rejected"]);
    expect(result[1]!.verificationEvents).toEqual([
      { id: "e1", action: "verified", note: "e1", actor: { id: "reviewer", name: "Reviewer" }, createdAt: timestamp.toISOString() },
      { id: "e2", action: "reset", note: "e2", actor: { id: "reviewer", name: "Reviewer" }, createdAt: timestamp.toISOString() },
    ]);
    expect(result[2]!.verificationEvents).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("foreign");
  });

  test("history query failure propagates rather than returning a false empty audit trail", async () => {
    let calls = 0;
    const db = {
      $queryRaw() {
        calls += 1;
        return calls === 1 ? Promise.resolve([item("a")]) : Promise.reject(new Error("history unavailable"));
      },
    } as unknown as Parameters<typeof listLecturerPortfolioItems>[0];
    await expect(listLecturerPortfolioItems(db, owner)).rejects.toThrow("history unavailable");
    expect(calls).toBe(2);
  });
});
