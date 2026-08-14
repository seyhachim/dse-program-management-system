import type {
  ActiveLearningCluster,
  ActiveLearningStrategy,
  ManagedMethodsResponse,
  Method,
  MethodKind,
  MethodsResponse,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const methodsApi = {
  list(): Promise<MethodsResponse> {
    return api.get<MethodsResponse>("/api/methods");
  },
  listManaged(): Promise<ManagedMethodsResponse> {
    return api.get<ManagedMethodsResponse>("/api/methods/managed");
  },
  add(kind: MethodKind, name: string): Promise<Method> {
    return api.post<Method>(`/api/methods/${kind}`, { name });
  },
  rename(kind: MethodKind, id: string, name: string): Promise<Method> {
    return api.put<Method>(`/api/methods/${kind}/${id}`, { name });
  },
  setActive(kind: MethodKind, id: string, active: boolean): Promise<Method> {
    return api.put<Method>(`/api/methods/${kind}/${id}/active`, { active });
  },
  createCluster(input: {
    id: string;
    name: string;
    description: string;
    sortOrder: number;
  }): Promise<ActiveLearningCluster> {
    return api.post<ActiveLearningCluster>("/api/methods/active-learning/clusters", input);
  },
  updateCluster(
    id: string,
    input: { name: string; description: string; sortOrder: number },
  ): Promise<ActiveLearningCluster> {
    return api.put<ActiveLearningCluster>(`/api/methods/active-learning/clusters/${id}`, input);
  },
  setClusterActive(id: string, active: boolean): Promise<ActiveLearningCluster> {
    return api.put<ActiveLearningCluster>(`/api/methods/active-learning/clusters/${id}/active`, { active });
  },
  createStrategy(input: {
    id: string;
    name: string;
    clusterId: string;
    sortOrder: number;
  }): Promise<ActiveLearningStrategy> {
    return api.post<ActiveLearningStrategy>("/api/methods/active-learning/strategies", input);
  },
  updateStrategy(
    id: string,
    input: { name: string; clusterId: string; sortOrder: number },
  ): Promise<ActiveLearningStrategy> {
    return api.put<ActiveLearningStrategy>(`/api/methods/active-learning/strategies/${id}`, input);
  },
  setStrategyActive(id: string, active: boolean): Promise<ActiveLearningStrategy> {
    return api.put<ActiveLearningStrategy>(`/api/methods/active-learning/strategies/${id}/active`, { active });
  },
};
