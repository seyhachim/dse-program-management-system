import type { PluginManifest } from "./plugins.ts";

/** Frontend route contribution for the lecturer-owned professional portfolio. */
export const lecturerPortfolioManifest: PluginManifest = {
  id: "lecturer-portfolio",
  name: "Lecturer Portfolio",
  version: "0.1.0",
  description: "Lecturer professional profile and canonical PMS-derived teaching portfolio.",
  routes: [
    {
      label: "My Portfolio",
      path: "/lecturer-portfolio",
      icon: "user-cog",
      roles: ["lecturer"],
      group: "Personal",
    },
  ],
};
