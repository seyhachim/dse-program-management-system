import type { PluginManifest } from "./plugins.ts";

/**
 * Programme curriculum workspace navigation. Kept additive like Community while
 * the legacy plugin registry is gradually decomposed into feature manifests.
 */
export const curriculumWorkspaceManifest: PluginManifest = {
  id: "programme-curriculum",
  name: "Programme Curriculum",
  version: "0.1.0",
  description: "Versioned Year 1-4 programme curriculum workspace.",
  routes: [
    {
      label: "Curriculum",
      path: "/curriculum",
      icon: "layers",
      roles: ["admin", "program_coordinator"],
      group: "Academic",
    },
  ],
};
