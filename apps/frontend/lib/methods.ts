import type {
  ActiveLearningCluster,
  ActiveLearningStrategy,
  ManagedMethodsResponse,
  Method,
  MethodKind,
  MethodsResponse,
} from "@dse-pms/shared-types";
import { api } from "./api";

let methodsListCache: Promise<MethodsResponse> | null = null;
let methodsListValueCache: MethodsResponse | null = null;

function invalidateMethodsList() {
  methodsListCache = null;
  methodsListValueCache = null;
}

export const methodsApi = {
  list(): Promise<MethodsResponse> {
    if (methodsListCache) return methodsListCache;
    methodsListCache = api
      .get<MethodsResponse>("/api/methods")
      .then((value) => {
        methodsListValueCache = value;
        return value;
      })
      .catch((error) => {
        methodsListCache = null;
        methodsListValueCache = null;
        throw error;
      });
    return methodsListCache;
  },
  getCached(): MethodsResponse | undefined {
    return methodsListValueCache ?? undefined;
  },
  catalog(): Promise<ManagedMethodsResponse> {
    return api.get<ManagedMethodsResponse>("/api/methods/catalog");
  },
  listManaged(): Promise<ManagedMethodsResponse> {
    return api.get<ManagedMethodsResponse>("/api/methods/managed");
  },
  async add(kind: MethodKind, name: string): Promise<Method> {
    const result = await api.post<Method>(`/api/methods/${kind}`, { name });
    invalidateMethodsList();
    return result;
  },
  async rename(kind: MethodKind, id: string, name: string): Promise<Method> {
    const result = await api.put<Method>(`/api/methods/${kind}/${id}`, { name });
    invalidateMethodsList();
    return result;
  },
  async setActive(kind: MethodKind, id: string, active: boolean): Promise<Method> {
    const result = await api.put<Method>(`/api/methods/${kind}/${id}/active`, { active });
    invalidateMethodsList();
    return result;
  },
  async createCluster(input: {
    id: string;
    name: string;
    description: string;
    sortOrder: number;
  }): Promise<ActiveLearningCluster> {
    const result = await api.post<ActiveLearningCluster>(
      "/api/methods/active-learning/clusters",
      input,
    );
    invalidateMethodsList();
    return result;
  },
  async updateCluster(
    id: string,
    input: { name: string; description: string; sortOrder: number },
  ): Promise<ActiveLearningCluster> {
    const result = await api.put<ActiveLearningCluster>(
      `/api/methods/active-learning/clusters/${id}`,
      input,
    );
    invalidateMethodsList();
    return result;
  },
  async setClusterActive(id: string, active: boolean): Promise<ActiveLearningCluster> {
    const result = await api.put<ActiveLearningCluster>(
      `/api/methods/active-learning/clusters/${id}/active`,
      { active },
    );
    invalidateMethodsList();
    return result;
  },
  async createStrategy(input: {
    id: string;
    name: string;
    clusterId: string;
    sortOrder: number;
  }): Promise<ActiveLearningStrategy> {
    const result = await api.post<ActiveLearningStrategy>(
      "/api/methods/active-learning/strategies",
      input,
    );
    invalidateMethodsList();
    return result;
  },
  async updateStrategy(
    id: string,
    input: { name: string; clusterId: string; sortOrder: number },
  ): Promise<ActiveLearningStrategy> {
    const result = await api.put<ActiveLearningStrategy>(
      `/api/methods/active-learning/strategies/${id}`,
      input,
    );
    invalidateMethodsList();
    return result;
  },
  async setStrategyActive(id: string, active: boolean): Promise<ActiveLearningStrategy> {
    const result = await api.put<ActiveLearningStrategy>(
      `/api/methods/active-learning/strategies/${id}/active`,
      { active },
    );
    invalidateMethodsList();
    return result;
  },
};