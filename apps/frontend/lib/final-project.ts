import type {
  FinalProjectSupervisorOverview,
  FinalProjectSupervisorProfile,
  UpsertFinalProjectSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const finalProjectApi = {
  discovery(): Promise<FinalProjectSupervisorProfile[]> {
    return api.get<FinalProjectSupervisorProfile[]>("/api/final-project/discovery");
  },
  me(): Promise<FinalProjectSupervisorProfile | null> {
    return api.get<FinalProjectSupervisorProfile | null>("/api/final-project/me");
  },
  updateMe(
    input: UpsertFinalProjectSupervisorProfileInput,
  ): Promise<FinalProjectSupervisorProfile> {
    return api.put<FinalProjectSupervisorProfile>("/api/final-project/me", input);
  },
  overview(): Promise<FinalProjectSupervisorOverview> {
    return api.get<FinalProjectSupervisorOverview>("/api/final-project/overview");
  },
};
