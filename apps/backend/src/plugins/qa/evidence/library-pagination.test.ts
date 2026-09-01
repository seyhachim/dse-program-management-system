import { expect, test } from "bun:test";
import {
  InvalidQaEvidenceLibraryPageCursorError,
  buildQaEvidenceLibraryPageFindManyArgs,
  decodeQaEvidenceLibraryPageCursor,
} from "./library.ts";

function cursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

test("evidence library page query is programme-scoped, stable, and uses one look-ahead row", () => {
  const args = buildQaEvidenceLibraryPageFindManyArgs({ programmeId: "dse", limit: 50 });

  expect(args.where).toEqual({ programmeId: "dse" });
  expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  expect(args.take).toBe(51);
});

test("programme filter is retained before the composite cursor boundary", () => {
  const createdAt = "2026-08-31T10:00:00.000Z";
  const args = buildQaEvidenceLibraryPageFindManyArgs({
    programmeId: "dse",
    limit: 20,
    cursor: cursor(createdAt, "evidence-2"),
  });

  expect(args.where).toEqual({
    programmeId: "dse",
    AND: [
      {
        OR: [
          { createdAt: { lt: new Date(createdAt) } },
          { createdAt: new Date(createdAt), id: { lt: "evidence-2" } },
        ],
      },
    ],
  });
  expect(args.take).toBe(21);
});

test("evidence library cursor validation fails closed", () => {
  expect(() => decodeQaEvidenceLibraryPageCursor("not-a-valid-cursor")).toThrow(
    InvalidQaEvidenceLibraryPageCursorError,
  );
  expect(() => decodeQaEvidenceLibraryPageCursor(cursor("not-a-date", "evidence-1"))).toThrow(
    InvalidQaEvidenceLibraryPageCursorError,
  );
});
