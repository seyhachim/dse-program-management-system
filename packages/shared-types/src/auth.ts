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

/** The three application roles. Shared so nav/permission gating can key off it. */
export const Role = z.enum(["admin", "lecturer", "student"]);
export type Role = z.infer<typeof Role>;

/** Shape returned by GET /api/auth/me — the resolved caller. */
export const MeResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  role: Role,
  name: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;
