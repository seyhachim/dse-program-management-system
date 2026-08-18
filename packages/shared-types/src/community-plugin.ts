import type { PluginManifest } from "./plugins.ts";

/** Community of Practice is shared by students and staff. Governance actions remain backend-authorized. */
export const communityManifest: PluginManifest = {
  id: "community",
  name: "Community of Practice",
  version: "0.1.0",
  description:
    "Student/staff communities for peer learning, discussion, shared practice, and tracked programme improvement.",
  routes: [
    {
      label: "Community of Practice",
      path: "/community",
      icon: "users",
      roles: [
        "admin",
        "program_coordinator",
        "program_secretary",
        "lecturer",
        "qa_contributor",
        "qa_reviewer",
        "student",
      ],
      group: "Community",
    },
  ],
};
