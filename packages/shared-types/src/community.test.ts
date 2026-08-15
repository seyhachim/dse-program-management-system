import { expect, test } from "bun:test";
import {
  CreateCommunityActionSchema,
  CreateCommunityCommentSchema,
  CreateCommunityDiscussionSchema,
  CreateCommunitySchema,
  UpdateCommunityActionStatusSchema,
} from "./community.ts";
import { communityManifest } from "./community-plugin.ts";

test("community creation requires a meaningful purpose", () => {
  expect(CreateCommunitySchema.safeParse({
    programmeId: "dse",
    name: "Machine Learning & MLOps",
    description: "Share deployment practice across students and lecturers.",
    category: "ML / MLOps",
    leadership: "Mixed",
  }).success).toBe(true);

  expect(CreateCommunitySchema.safeParse({
    programmeId: "dse",
    name: "ML",
    description: "short",
    category: "ML",
    leadership: "Mixed",
  }).success).toBe(false);
});

test("students can reach the Community of Practice route", () => {
  const route = communityManifest.routes?.[0];
  expect(route?.path).toBe("/community");
  expect(route?.roles).toContain("student");
  expect(route?.roles).toContain("lecturer");
});

test("discussion and action workflow contracts are bounded", () => {
  expect(CreateCommunityDiscussionSchema.safeParse({
    title: "Improve deployment skills",
    body: "Students need more practice deploying models to real environments.",
    tags: ["Student feedback", "Curriculum"],
  }).success).toBe(true);
  expect(CreateCommunityCommentSchema.safeParse({ body: "A hands-on lab would help." }).success).toBe(true);
  expect(CreateCommunityActionSchema.safeParse({ summary: "Pilot a deployment lab in Project Practicum." }).success).toBe(true);
  expect(UpdateCommunityActionStatusSchema.safeParse({ status: "Evaluated" }).success).toBe(true);
  expect(UpdateCommunityActionStatusSchema.safeParse({ status: "Done" }).success).toBe(false);
});
