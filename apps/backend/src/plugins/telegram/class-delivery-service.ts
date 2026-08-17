import type {
  ClassResponsibilityView,
  LecturerArrivalConfirmationView,
  LecturerArrivalStatus,
  SaveLecturerArrivalConfirmationResult,
} from "@dse-pms/shared-types";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { registry } from "../../core/plugins/registry.ts";
import { telegramIdentityStore } from "./identity-store.ts";
import type { TelegramSessionUser } from "./session.ts";

const WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

interface OfferingView {
  id: string;
  course?: { programmeId?: string | null } | null;
  lecturer?: { id: string } | null;
  coLecturers: Array<{ id: string }>;
}

interface OfferingsContract {
  getById(id: string): Promise<OfferingView | null>;
  classResponsibilities: {
    assertActiveForUser(userId: string, offeringId: string): Promise<ClassResponsibilityView>;
  };
  classDelivery: {
    getLecturerArrival(offeringId: string, date: string): Promise<LecturerArrivalConfirmationView | null>;
    saveLecturerArrival(
      offeringId: string,
      date: string,
      status: LecturerArrivalStatus,
      actorId: string,
    ): Promise<SaveLecturerArrivalConfirmationResult>;
  };
}

interface AuditInput {
  identityId?: string | null;
  userId?: string | null;
  telegramUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: unknown;
}

export class TelegramClassDeliveryNotFoundError extends Error {}
export class TelegramClassDeliveryAccessError extends Error {}

function authUser(user: TelegramSessionUser): AuthUser {
  return { id: user.id, email: user.email, roles: user.roles, programmeRoles: user.programmeRoles };
}

function productionOfferings(): OfferingsContract {
  return registry.get<OfferingsContract>("offerings").service;
}

export function createTelegramClassDeliveryService(
  injectedOfferings?: OfferingsContract,
  audit: (input: AuditInput) => Promise<void> = telegramIdentityStore.audit,
) {
  const offerings = () => injectedOfferings ?? productionOfferings();

  async function authorize(user: TelegramSessionUser, offeringId: string) {
    const service = offerings();
    const offering = await service.getById(offeringId);
    if (!offering) throw new TelegramClassDeliveryNotFoundError("Offering not found");

    const programmeId = offering.course?.programmeId ?? null;
    const assignedLecturer =
      offering.lecturer?.id === user.id ||
      offering.coLecturers.some((item) => item.id === user.id);
    const programmeWide = hasAnyRoleInProgramme(authUser(user), WIDE_ROLES, programmeId);

    if (assignedLecturer || programmeWide) {
      return {
        actorKind: "Lecturer" as const,
        responsibilityAssignmentId: null,
      };
    }

    try {
      const responsibility = await service.classResponsibilities.assertActiveForUser(user.id, offeringId);
      return {
        actorKind: responsibility.role,
        responsibilityAssignmentId: responsibility.id,
      };
    } catch {
      throw new TelegramClassDeliveryAccessError(
        "You are not authorized to confirm lecturer arrival for this offering",
      );
    }
  }

  return {
    async get(user: TelegramSessionUser, offeringId: string, date: string) {
      const access = await authorize(user, offeringId);
      const confirmation = await offerings().classDelivery.getLecturerArrival(offeringId, date);
      return {
        access: {
          actorKind: access.actorKind,
          responsibilityAssignmentId: access.responsibilityAssignmentId,
        },
        confirmation,
      };
    },

    async save(
      user: TelegramSessionUser,
      offeringId: string,
      date: string,
      status: LecturerArrivalStatus,
    ) {
      const access = await authorize(user, offeringId);
      const result = await offerings().classDelivery.saveLecturerArrival(
        offeringId,
        date,
        status,
        user.id,
      );

      await audit({
        identityId: user.identity.id,
        userId: user.id,
        telegramUserId: user.identity.telegramUserId,
        action: "lecturer_arrival_confirmed",
        resourceType: "Offering",
        resourceId: offeringId,
        metadata: {
          offeringId,
          date,
          resultingState: result.confirmation.status,
          actorKind: access.actorKind,
          responsibilityAssignmentId: access.responsibilityAssignmentId,
          changed: result.changed,
        },
      });

      return {
        ...result,
        access: {
          actorKind: access.actorKind,
          responsibilityAssignmentId: access.responsibilityAssignmentId,
        },
      };
    },
  };
}

export const telegramClassDeliveryService = createTelegramClassDeliveryService();

export function telegramClassDeliveryErrorStatus(error: unknown): number | null {
  if (error instanceof TelegramClassDeliveryNotFoundError) return 404;
  if (error instanceof TelegramClassDeliveryAccessError) return 403;
  return null;
}
