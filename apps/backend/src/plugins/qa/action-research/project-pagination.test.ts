import { expect, test } from "bun:test";
import { ResearchProjectPageQuerySchema } from "@dse-pms/shared-types";
import {
  InvalidResearchProjectPageCursorError,
  buildResearchProjectPageQueryParts,
  decodeResearchProjectPageCursor,
} from "./project-pagination.ts";

function cursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

test("Action Research project page query is bounded with a fifty-row default", () => {
  expect(ResearchProjectPageQuerySchema.parse({ programmeId: "dse" })).toEqual({
    programmeId: "dse",
    limit: 50,
  });
  expect(ResearchProjectPageQuerySchema.parse({ programmeId: "dse", limit: "100" }).limit).toBe(100);
  expect(ResearchProjectPageQuerySchema.safeParse({ programmeId: "dse", limit: 0 }).success).toBe(false);
  expect(ResearchProjectPageQuerySchema.safeParse({ programmeId: "dse", limit: 101 }).success).toBe(false);
  expect(ResearchProjectPageQuerySchema.safeParse({ programmeId: "dse", cursor: "" }).success).toBe(false);
});

test("project page keeps programme scope, stable immutable ordering and one look-ahead row", () => {
  const parts = buildResearchProjectPageQueryParts({ programmeId: "dse", limit: 50 });
  expect(parts.programmeId).toBe("dse");
  expect(parts.limitWithLookahead).toBe(51);
  expect(parts.cursor).toBeNull();
  expect(parts.orderBy).toEqual(["createdAt DESC", "id DESC"]);
});

test("project page decodes the composite createdAt/id cursor boundary", () => {
  const createdAt = "2026-09-01T10:00:00.000Z";
  const parts = buildResearchProjectPageQueryParts({
    programmeId: "dse",
    limit: 20,
    cursor: cursor(createdAt, "project-2"),
  });
  expect(parts.cursor).toEqual({ createdAt, id: "project-2" });
  expect(parts.limitWithLookahead).toBe(21);
});

test("project page cursor validation fails closed", () => {
  expect(() => decodeResearchProjectPageCursor("not-a-valid-cursor")).toThrow(
    InvalidResearchProjectPageCursorError,
  );
  expect(() => decodeResearchProjectPageCursor(cursor("not-a-date", "project-1"))).toThrow(
    InvalidResearchProjectPageCursorError,
  );
  expect(() => decodeResearchProjectPageCursor(cursor("2026-09-01T10:00:00.000Z", ""))).toThrow(
    InvalidResearchProjectPageCursorError,
  );
});
