import { expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import {
  defaultProgrammeIdForRole,
  hasAnyRoleInProgramme,
  hasGlobalRole,
  hasRoleInProgramme,
  signToken,
  verifyToken,
  type AuthUser,
  type ProgrammeRoleAssignment,
} from "./token.ts";

const PROGRAMME_A = "dse";
const PROGRAMME_B = "computer-science";

function userWith(programmeRoles: ProgrammeRoleAssignment[]): AuthUser {
  return { id: "user-1", email: "user@dse.dev", roles: programmeRoles.map((a) => a.role), programmeRoles };
}

// Issue #147 acceptance gate: with only one real Programme row in any live
// database, an enforcement check can't be proven against real data — every
// check is trivially true. This synthetic two-programme test is what proves
// the predicate isn't a silent no-op.
test("a coordinator scoped to programme A is denied programme B, admin is not", () => {
  const coordinatorA = userWith([{ role: "program_coordinator", programmeId: PROGRAMME_A }]);
  const globalAdmin = userWith([{ role: "admin", programmeId: null }]);

  expect(hasAnyRoleInProgramme(coordinatorA, ["admin", "program_coordinator"], PROGRAMME_A)).toBe(true);
  expect(hasAnyRoleInProgramme(coordinatorA, ["admin", "program_coordinator"], PROGRAMME_B)).toBe(false);
  expect(hasAnyRoleInProgramme(globalAdmin, ["admin", "program_coordinator"], PROGRAMME_A)).toBe(true);
  expect(hasAnyRoleInProgramme(globalAdmin, ["admin", "program_coordinator"], PROGRAMME_B)).toBe(true);
});

test("a resource with no programme (null) only matches a global grant, never a scoped one", () => {
  const coordinatorA = userWith([{ role: "program_coordinator", programmeId: PROGRAMME_A }]);
  const globalAdmin = userWith([{ role: "admin", programmeId: null }]);

  expect(hasAnyRoleInProgramme(coordinatorA, ["program_coordinator"], null)).toBe(false);
  expect(hasAnyRoleInProgramme(globalAdmin, ["admin"], null)).toBe(true);
});

test("hasGlobalRole / hasRoleInProgramme agree with hasAnyRoleInProgramme for a single role", () => {
  const secretaryA = userWith([{ role: "program_secretary", programmeId: PROGRAMME_A }]);

  expect(hasGlobalRole(secretaryA, "program_secretary")).toBe(false);
  expect(hasRoleInProgramme(secretaryA, "program_secretary", PROGRAMME_A)).toBe(true);
  expect(hasRoleInProgramme(secretaryA, "program_secretary", PROGRAMME_B)).toBe(false);
});

test("defaultProgrammeIdForRole: admin is global, every other role defaults to the seeded programme", () => {
  expect(defaultProgrammeIdForRole("admin")).toBeNull();
  expect(defaultProgrammeIdForRole("program_coordinator")).toBe("dse");
  expect(defaultProgrammeIdForRole("lecturer")).toBe("dse");
  expect(defaultProgrammeIdForRole("student")).toBe("dse");
});

// The live demo's NEXT_PUBLIC_DEV_TOKEN is a 7-day token minted before this
// change, carrying only `roles: ["admin"]` — no `programmeRoles` claim.
// verifyToken must synthesize one that still passes every programme-scoped
// check, or this ships as an outage on the deployed demo.
test("verifyToken synthesizes a global grant for a pre-#147 admin token (live demo token trace)", () => {
  process.env.JWT_SECRET ??= "test-secret";
  // Reproduces the exact shape of the live demo's NEXT_PUBLIC_DEV_TOKEN: only
  // `roles`, no `programmeRoles` claim (minted before this field existed).
  const trulyLegacyToken = jwt.sign({ email: "admin@dse.dev", roles: ["admin"] }, process.env.JWT_SECRET, {
    subject: "admin-1",
    expiresIn: "7d",
  });

  const user = verifyToken(trulyLegacyToken);
  expect(user.programmeRoles).toEqual([{ role: "admin", programmeId: null }]);
  expect(hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], "dse")).toBe(true);
  expect(hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], "any-other-programme")).toBe(true);
});

test("verifyToken synthesizes a scoped grant for a legacy single-role, non-admin token", () => {
  process.env.JWT_SECRET ??= "test-secret";
  const preIssue77Token = jwt.sign({ email: "lecturer@dse.dev", role: "lecturer" }, process.env.JWT_SECRET, {
    subject: "lecturer-1",
    expiresIn: "7d",
  });

  const user = verifyToken(preIssue77Token);
  expect(user.roles).toEqual(["lecturer"]);
  expect(user.programmeRoles).toEqual([{ role: "lecturer", programmeId: "dse" }]);
});
