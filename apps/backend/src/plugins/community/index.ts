import { communityManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCommunityRouter } from "./router.ts";
import * as service from "./service.ts";

export type CommunityService = typeof service;

export const communityPlugin: BackendPlugin<CommunityService> = {
  manifest: communityManifest,
  router: createCommunityRouter(),
  service,
};
