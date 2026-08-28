import type {
  ActiveLearningCluster,
  ActiveLearningStrategy,
  ManagedMethodsResponse,
  Method,
  MethodKind,
  MethodsResponse,
} from "@dse-pms/shared-types";
import { api } from "./api";

let methodsCache: MethodsResponse | null = null;
let methodsRequest: Promise<MethodsResponse> | null = null;

function invalidateMethodsCache() {
  methodsCache = null;
  methodsRequest = null;
}

function listMethods(): Promise<MethodsResponse> {
  if (methodsCache) return Promise.resolve(methodsCache);
  if (methodsRequest) return methodsRequest;

  methodsRequest = api
    .get<MethodsResponse>("/api/methods")
    .then((methods) => {
      methodsCache = methods;
      return methods;
    })
    .finally(() => {
      methodsRequest = null;
    });

  return methodsRequest;
}

function invalidateAfter<T>(request: Promise<T>): Promise<T> {
  return request.then((result) => {
    invalidateMethodsCache();
    return result;
  });
}

export const methodsApi = {
  list: listMethods,
  invalidateList: invalidateMethodsCache,
  catalog(): Promise<ManagedMethodsResponse> {
    return api.get<ManagedMethodsResponse>("/api/methods/catalog");
  },
  listManaged(): Promise<ManagedMethodsResponse> {
    return api.get<ManagedMethodsResponse>("/api/methods/managed");
  },
  add(kind: MethodKind, name: string): Promise<Method> {
    return invalidateAfter(api.post<Method>(`/api/methods/${kind}`, { name }));
  },
  rename(kind: MethodKind, id: string, name: string): Promise<Method> {
    return invalidateAfter(api.put<Method>(`/api/methods/${kind}/${id}`, { name }));
  },
  setActive(kind: MethodKind, id: string, active: boolean): Promise<Method> {
    return invalidateAfter(
      api.put<Method>(`/api/methods/${kind}/${id}/active`, { active }),
    );
  },
  createCluster(input: {
    id: string;
    name: string;
    description: string;
    sortOrder: number;
  }): Promise<ActiveLearningCluster> {
    return invalidateAfter(
      api.post<ActiveLearningCluster>("/api/methods/active-learning/clusters", input),
    );
  },
  updateCluster(
    id: string,
    input: { name: string; description: string; sortOrder: number },
  ): Promise<ActiveLearningCluster> {
    return invalidateAfter(
      api.put<ActiveLearningCluster>(`/api/methods/active-learning/clusters/${id}`, input),
    );
  },
  setClusterActive(id: string, active: boolean): Promise<ActiveLearningCluster> {
    return invalidateAfter(
      api.put<ActiveLearningCluster>(
        `/api/methods/active-learning/clusters/${id}/active`,
        { active },
      ),
    );
  },
  createStrategy(input: {
    id: string;
    name: string;
    clusterId: string;
    sortOrder: number;
  }): Promise<ActiveLearningStrategy> {
    return invalidateAfter(
      api.post<ActiveLearningStrategy>(
        "/api/methods/active-learning/strategies",
        input,
      ),
    );
  },
  updateStrategy(
    id: string,
    input: { name: string; clusterId: string; sortOrder: number },
  ): Promise<ActiveLearningStrategy> {
    return invalidateAfter(
      api.put<ActiveLearningStrategy>(
        `/api/methods/active-learning/strategies/${id}`,
        input,
      ),
    );
  },
  setStrategyActive(id: string, active: boolean): Promise<ActiveLearningStrategy> {
    return invalidateAfter(
      api.put<ActiveLearningStrategy>(
        `/api/methods/active-learning/strategies/${id}/active`,
        { active },
      ),
    );
  },
};
