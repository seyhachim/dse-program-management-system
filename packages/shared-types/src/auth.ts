import { z } from "zod";

/**
 * Auth plugin schemas. `CreateAccountInput` backs the admin-only "create a login
 * account" action: an admin provisions a Supabase auth credential (via invite) and
 * a linked app `User` row. `role` is fixed to "lecturer" for now (issue #10) but is
 * modelled as an enum so it can widen without a shape change.
 */
export const CreateAccountInput = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  role: z.enum(["lecturer"]).default("lecturer"),
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
 */
export const MeResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  role: Role,
  roles: z.array(Role),
  name: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;
