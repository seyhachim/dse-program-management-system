import { describe, expect, test } from "bun:test";
import { applyProjectGroupAction, assertProjectGroupMembers } from "./course-project-group-policy.ts";
import type { CourseProjectGroupProposal } from "@dse-pms/shared-types";

const context = {
  policy: { enabled: true, minMembers: 2, maxMembers: 3, maxGroups: 2, deadlineAt: "2026-12-01T00:00:00+07:00" },
  now: new Date("2026-11-24T00:00:00Z"),
  actorEnrollmentId: "a",
  eligibleEnrollmentIds: new Set(["a", "b", "c", "d"]),
  academicEnrollmentIds: new Set<string>(),
  academicGroupCount: 0,
  academicGroupNames: new Set<string>(),
  scoringStarted: false,
};
const create = (previous: CourseProjectGroupProposal[] = []) => applyProjectGroupAction(previous, { action: "create", name: "Rainfall" }, context, "team");
const invite = () => applyProjectGroupAction(create(), { action: "invite", proposalId: "team", enrollmentId: "b" }, context, "");
const accept = () => applyProjectGroupAction(invite(), { action: "accept", proposalId: "team" }, { ...context, actorEnrollmentId: "b" }, "");

describe("course project proposal policy", () => {
  test("leader creates, classmate accepts, leader submits; original state is unchanged", () => {
    const original = invite();
    const accepted = applyProjectGroupAction(original, { action: "accept", proposalId: "team" }, { ...context, actorEnrollmentId: "b" }, "");
    expect(original[0]!.members[1]!.status).toBe("pending");
    expect(accepted[0]!.members[1]!.status).toBe("accepted");
    expect(applyProjectGroupAction(accepted, { action: "submit", proposalId: "team" }, context, "")[0]!.status).toBe("submitted");
  });
  test("rejects cross-section invite, unauthorized acceptance, and unaccepted submission", () => {
    expect(() => applyProjectGroupAction(create(), { action: "invite", proposalId: "team", enrollmentId: "outside" }, context, "")).toThrow();
    expect(() => applyProjectGroupAction(invite(), { action: "accept", proposalId: "team" }, { ...context, actorEnrollmentId: "c" }, "")).toThrow();
    expect(() => applyProjectGroupAction(invite(), { action: "submit", proposalId: "team" }, context, "")).toThrow();
  });
  test("rejects closed registration, scoring lock and academic duplicate membership", () => {
    expect(() => applyProjectGroupAction([], { action: "create", name: "A" }, { ...context, now: new Date("2026-12-02") }, "team")).toThrow();
    expect(() => applyProjectGroupAction([], { action: "create", name: "A" }, { ...context, scoringStarted: true }, "team")).toThrow();
    expect(() => applyProjectGroupAction([], { action: "create", name: "A" }, { ...context, academicEnrollmentIds: new Set(["a"]) }, "team")).toThrow();
  });
  test("enforces group count, duplicate name and one accepted team", () => {
    expect(() => create(create())).toThrow();
    expect(() => applyProjectGroupAction([], { action: "create", name: "A" }, { ...context, academicGroupCount: 2 }, "team")).toThrow();
    expect(() => applyProjectGroupAction([], { action: "create", name: "Rainfall" }, { ...context, academicGroupNames: new Set(["rainfall"]) }, "team")).toThrow();
    expect(() => applyProjectGroupAction(accept(), { action: "create", name: "Other" }, { ...context, actorEnrollmentId: "b" }, "team2")).toThrow();
  });
  test("revalidates changed roster and academic memberships before approval", () => {
    const proposal = accept()[0]!;
    expect(assertProjectGroupMembers(proposal, context)).toEqual(["a", "b"]);
    expect(() => assertProjectGroupMembers(proposal, { ...context, eligibleEnrollmentIds: new Set(["a"]) })).toThrow();
    expect(() => assertProjectGroupMembers(proposal, { ...context, academicEnrollmentIds: new Set(["b"]) })).toThrow();
  });
});
