import { z } from "zod";
import type { AuthUser } from "../../core/auth/token.ts";

export const POLICY_TOPICS = ["obe", "ai", "grade_appeal", "data_protection"] as const;
export function policyAccess(user: AuthUser, programmeId: string): "manage" | "read" | "deny" {
  if (user.programmeRoles.some(a => a.role === "admin" && (a.programmeId === null || a.programmeId === programmeId))) return "manage";
  if (user.programmeRoles.some(a => a.role === "program_coordinator" && a.programmeId === programmeId)) return "manage";
  // A programme-scoped lecturer grant is the initial staff entitlement. No global lecturer grants.
  if (user.programmeRoles.some(a => a.role === "lecturer" && a.programmeId === programmeId)) return "read";
  return "deny";
}

const metadata = (max: number) => z.string().trim().min(1).max(max)
  .refine(s => !/(?:https?:|www\.|[a-z][a-z0-9+.-]*:\/\/)/i.test(s), "Use bibliographic metadata only; source links are not accepted");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}, "Invalid date");
export const policyRevisionInput = z.object({
  topic: z.enum(POLICY_TOPICS),
  expectedRevision: z.number().int().nonnegative(),
  title: metadata(200),
  institutionalOwner: metadata(150),
  version: metadata(80).nullable(),
  effectiveDate: date.nullable(),
  locator: metadata(200).nullable(),
  modules: metadata(200),
  status: z.enum(["pending", "verified", "archived"]),
}).strict().superRefine((value, ctx) => {
  if (value.status === "verified" && (!value.version || !value.locator))
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "Verified references require a version and section/page locator"});
  if (value.status === "archived" && value.expectedRevision === 0)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "Cannot archive a nonexistent policy"});
});
