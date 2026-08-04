import { z } from "zod";

/**
 * Auth plugin schemas. `CreateAccountInput` backs the admin-only "create a login
 * account" action: an admin provisions a Supabase auth credential (via invite) and
 * a linked app `User` row. `role` accepts the roles that need a self-service invite
 * path (issue #101 follow-up) — deliberately not the full `Role` enum:
 * - `admin` is excluded — minting a new admin login stays a manual/seed-only
 *   action, not something exposed through this form.
 * - `student` is excluded — students are provisioned via "Add Student" on the
 *   Students page, which creates a roster profile, not a login account.
 */
export const INVITABLE_ROLES = ["lecturer", "program_coordinator", "program_secretary", "qa_reviewer"] as const;
export const CreateAccountInput = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  role: z.enum(INVITABLE_ROLES).default("lecturer"),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

/**
 * The application roles (issue #101). Shared so nav/permission gating can key
 * off it. `program_coordinator`/`program_secretary`/`qa_reviewer` are
 * programme-wide today (there is exactly one programme, so nothing to scope
 * to yet) — see `PROGRAMME_WIDE_ROLES` in the backend's `token.ts`.
 */
export const Role = z.enum([
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_reviewer",
  "student",
]);
export type Role = z.infer<typeof Role>;

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
