import type { PluginManifest } from "./plugins.ts";

/** Frontend route contribution for the lecturer-owned professional portfolio. */
export const lecturerPortfolioManifest: PluginManifest = {
  id: "lecturer-portfolio",
  name: "Lecturer Portfolio",
  version: "0.2.0",
  description: "Lecturer professional profile, professional evidence, canonical teaching, and AUN-QA staff evidence projection.",
  routes: [
    {
      label: "My Portfolio",
      path: "/lecturer-portfolio",
      icon: "user-cog",
      roles: ["lecturer"],
      group: "Personal",
    },
    {
      label: "Professional Evidence",
      path: "/lecturer-portfolio/evidence",
      icon: "file-check",
      roles: ["lecturer"],
      group: "Personal",
    },
  ],
};
