import { z } from "zod";
import type { PluginManifest } from "./plugins.ts";

/**
 * Issue #1302: compile-checked teaching example, not a registered production plugin.
 * The explicit API and navigation integration is deliberately left to a reviewed PR.
 */
export const studentPluginStarterManifest: PluginManifest = {
  id: "student-plugin-starter",
  name: "Student Plugin Starter (Example Only)",
  version: "0.1.0",
  description: "Read-only, fictional exercise for reviewed student-developed plugins.",
  routes: [{
    label: "Student Plugin Example",
    path: "/student-plugin-starter",
    icon: "book",
    roles: ["student", "lecturer", "program_coordinator", "admin"],
    group: "Learning",
  }],
  permissions: ["student-plugin-starter:read"],
};

export const StudentPluginStarterQuery = z.object({
  programmeId: z.string().trim().min(1).max(80),
}).strict();
export type StudentPluginStarterQuery = z.infer<typeof StudentPluginStarterQuery>;

export const StudentPluginStarterWelcome = z.object({
  programmeId: z.string(),
  title: z.string(),
  message: z.string(),
}).strict();
export type StudentPluginStarterWelcome = z.infer<typeof StudentPluginStarterWelcome>;
