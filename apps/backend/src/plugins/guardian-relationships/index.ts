import type { PluginManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createGuardianRelationshipRouter } from "./router.ts";
import {
  guardianRelationshipService,
  type GuardianRelationshipService,
} from "./service.ts";

const guardianRelationshipsManifest: PluginManifest = {
  id: "guardian-relationships",
  name: "Guardian Relationships",
  version: "0.1.0",
  description: "Verified, effective-dated and scope-controlled parent/guardian access foundation.",
  permissions: [],
};

export const guardianRelationshipsPlugin: BackendPlugin<GuardianRelationshipService> = {
  manifest: guardianRelationshipsManifest,
  router: createGuardianRelationshipRouter(),
  service: guardianRelationshipService,
};
