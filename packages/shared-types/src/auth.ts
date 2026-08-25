import { z } from "zod";

/**
 * Auth plugin schemas. `CreateAccountInput` backs the admin-only "create a login
 * account" action: an admin provisions a Supabase auth credential (via invite) and
 * a linked app `User` row. `role` accepts the roles that need a self-service invite
 * path (issue #101 follow-up) — deliberately not the full `Role` enum:
 * - `admin` is excluded — minting a new admin login stays a manual/seed-only
 *   action, not something exposed through this form.
 * - `qa_contributor` is excluded — it is an additive programme role granted to
 *   an existing staff account rather than a standalone account type.
 * - `student` requires a roster profile with the same email; account
 *   provisioning links that profile to the invited User.
 */
export const INVITABLE_ROLES = ["lecturer", "program_coordinator", "program_secretary", "qa_reviewer", "student"] as const;
export const CreateAccountInput = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  role: z.enum(INVITABLE_ROLES).default("lecturer"),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

/** Result of rotating and sending a fresh pending lecturer invitation. */
export const ResendInvitationResponse = z.object({
  email: z.string().email(),
});
export type ResendInvitationResponse = z.infer<typeof ResendInvitationResponse>;

/**
 * Application roles. `qa_contributor` is intentionally additive: a lecturer or
 * other staff member can hold it alongside their existing role to work on an
 * assigned AUN-QA/SAR scope without receiving programme-management authority.
 */
export const Role = z.enum([
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_contributor",
  "qa_reviewer",
  "student",
]);
export type Role = z.infer<typeof Role>;

/**
 * Roles that can be granted through programme role management. Start narrowly:
 * programme leadership may add/remove the QA Contributor capability without
 * turning the role-management endpoint into a general privilege-escalation API.
 */
export const PROGRAMME_ASSIGNABLE_ROLES = ["qa_contributor"] as const;
export const ProgrammeAssignableRole = z.enum(PROGRAMME_ASSIGNABLE_ROLES);
export type ProgrammeAssignableRole = z.infer<typeof ProgrammeAssignableRole>;

export const ManageProgrammeRoleInput = z.object({
  userId: z.string().uuid(),
  programmeId: z.string().trim().min(1),
  role: ProgrammeAssignableRole,
});
export type ManageProgrammeRoleInput = z.infer<typeof ManageProgrammeRoleInput>;

export interface ProgrammeRoleAssignmentView {
  userId: string;
  userName: string;
  userEmail: string;
  programmeId: string;
  role: ProgrammeAssignableRole;
}

/**
 * Shape returned by GET /api/auth/me — the resolved caller. `role` is the
 * caller's primary role, kept alongside `roles` (issue #77 phase B, all of the
 * caller's assigned roles) so a frontend bundle deployed before this field
 * existed keeps working through the Render/Vercel deploy-skew window.
 * `permissions` is the union of every permission string granted by any of
 * `roles` (same union semantics as the backend's `roleHasPermission`) — it lets
 * the frontend gate actions (Add/Edit/Delete buttons, etc.) against the same
 * source of truth the backend enforces, instead of hardcoding role names.
 */
export const MeResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  role: Role,
  roles: z.array(Role),
  permissions: z.array(z.string()),
  name: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;
