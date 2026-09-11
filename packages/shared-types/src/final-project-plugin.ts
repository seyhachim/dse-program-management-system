import type { PluginManifest } from "./plugins.ts";

/** Final Project discovery routes. Application/assignment workflow is intentionally deferred. */
export const finalProjectManifest: PluginManifest = {
  id: "final-project",
  name: "Final Project",
  version: "0.1.0",
  description: "Year 4 Final Project supervisor discovery and programme-scoped supervision capacity.",
  routes: [
    {
      label: "Find a Supervisor",
      path: "/final-project/supervisors",
      icon: "graduation-cap",
      roles: ["student"],
      group: "Student",
    },
    {
      label: "Supervisor Profile",
      path: "/final-project/supervisor-profile",
      icon: "user-cog",
      roles: ["lecturer"],
      group: "Personal",
    },
    {
      label: "Supervisor Capacity",
      path: "/final-project/supervisors/manage",
      icon: "users",
      roles: ["admin", "program_coordinator"],
      group: "Academic",
    },
  ],
};
