import type {
  OfferingActivationExceptionSnapshot,
  RequestOfferingActivationExceptionInput,
  ResolveOfferingActivationExceptionInput,
  ReviewOfferingActivationExceptionInput,
  RevokeOfferingActivationExceptionInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const offeringActivationExceptionsApi = {
  get(offeringId: string): Promise<OfferingActivationExceptionSnapshot> {
    return api.get<OfferingActivationExceptionSnapshot>(
      `/api/offerings/${offeringId}/activation-exception`,
    );
  },

  request(
    offeringId: string,
    input: RequestOfferingActivationExceptionInput,
  ): Promise<OfferingActivationExceptionSnapshot> {
    return api.post<OfferingActivationExceptionSnapshot>(
      `/api/offerings/${offeringId}/activation-exception`,
      input,
    );
  },

  review(
    offeringId: string,
    exceptionId: string,
    input: ReviewOfferingActivationExceptionInput,
  ): Promise<OfferingActivationExceptionSnapshot> {
    return api.post<OfferingActivationExceptionSnapshot>(
      `/api/offerings/${offeringId}/activation-exception/${exceptionId}/review`,
      input,
    );
  },

  revoke(
    offeringId: string,
    exceptionId: string,
    input: RevokeOfferingActivationExceptionInput,
  ): Promise<OfferingActivationExceptionSnapshot> {
    return api.post<OfferingActivationExceptionSnapshot>(
      `/api/offerings/${offeringId}/activation-exception/${exceptionId}/revoke`,
      input,
    );
  },

  resolve(
    offeringId: string,
    exceptionId: string,
    input: ResolveOfferingActivationExceptionInput,
  ): Promise<OfferingActivationExceptionSnapshot> {
    return api.post<OfferingActivationExceptionSnapshot>(
      `/api/offerings/${offeringId}/activation-exception/${exceptionId}/resolve`,
      input,
    );
  },
};
