import type {
  ClassResponsibilityView,
  ClassSessionStatus,
  ClassSessionStatusView,
  LecturerArrivalConfirmationView,
  LecturerArrivalStatus,
  SaveClassSessionStatusResult,
  SaveLecturerArrivalConfirmationResult,
} from "@dse-pms/shared-types";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { registry } from "../../core/plugins/registry.ts";
import { telegramIdentityStore } from "./identity-store.ts";
import type { TelegramSessionUser } from "./session.ts";

const WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

type DeliveryActorKind = "Lecturer" | "ClassMonitor" | "SubClassMonitor" | "ProgrammeManager";

interface DeliveryAccess {
  actorKind: DeliveryActorKind;
  responsibilityAssignmentId: string | null;
  canRecordArrival: boolean;
  canManageSession: boolean;
}

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
    getClassSessionStatus(offeringId: string, date: string): Promise<ClassSessionStatusView | null>;
    saveLecturerArrival(
      offeringId: string,
      date: string,
      status: LecturerArrivalStatus,
      note: string,
      actorId: string,
    ): Promise<SaveLecturerArrivalConfirmationResult>;
    saveClassSessionStatus(
      offeringId: string,
      date: string,
      status: ClassSessionStatus,
      reason: string,
      actorId: string,
    ): Promise<SaveClassSessionStatusResult>;
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

  async function authorize(user: TelegramSessionUser, offeringId: string): Promise<DeliveryAccess> {
    const service = offerings();
    const offering = await service.getById(offeringId);
    if (!offering) throw new TelegramClassDeliveryNotFoundError("Offering not found");

    const programmeId = offering.course?.programmeId ?? null;
    const assignedLecturer =
      offering.lecturer?.id === user.id ||
      offering.coLecturers.some((item) => item.id === user.id);
    const programmeWide = hasAnyRoleInProgramme(authUser(user), WIDE_ROLES, programmeId);

    if (assignedLecturer) {
      return {
        actorKind: "Lecturer",
        responsibilityAssignmentId: null,
        canRecordArrival: true,
        canManageSession: programmeWide,
      };
    }

    if (programmeWide) {
      return {
        actorKind: "ProgrammeManager",
        responsibilityAssignmentId: null,
        canRecordArrival: false,
        canManageSession: true,
      };
    }

    try {
      const responsibility = await service.classResponsibilities.assertActiveForUser(user.id, offeringId);
      return {
        actorKind: responsibility.role,
        responsibilityAssignmentId: responsibility.id,
        canRecordArrival: true,
        canManageSession: false,
      };
    } catch {
      throw new TelegramClassDeliveryAccessError(
        "You are not authorized to access class delivery for this offering",
      );
    }
  }

  return {
    async get(user: TelegramSessionUser, offeringId: string, date: string) {
      const access = await authorize(user, offeringId);
      const [confirmation, session] = await Promise.all([
        offerings().classDelivery.getLecturerArrival(offeringId, date),
        offerings().classDelivery.getClassSessionStatus(offeringId, date),
      ]);
      return { access, confirmation, session };
    },

    async save(
      user: TelegramSessionUser,
      offeringId: string,
      date: string,
      status: LecturerArrivalStatus,
      note: string,
    ) {
      const access = await authorize(user, offeringId);
      if (!access.canRecordArrival) {
        throw new TelegramClassDeliveryAccessError(
          "Your programme role can manage the class session but cannot record lecturer arrival",
        );
      }

      const session = await offerings().classDelivery.getClassSessionStatus(offeringId, date);
      if (session && session.status !== "Scheduled") {
        throw new TelegramClassDeliveryAccessError(
          `Lecturer arrival is not applicable while the class session is ${session.status}`,
        );
      }

      const result = await offerings().classDelivery.saveLecturerArrival(
        offeringId,
        date,
        status,
        note,
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
          note: result.confirmation.note,
          actorKind: access.actorKind,
          responsibilityAssignmentId: access.responsibilityAssignmentId,
          changed: result.changed,
        },
      });

      return { ...result, access, session };
    },

    async saveSession(
      user: TelegramSessionUser,
      offeringId: string,
      date: string,
      status: ClassSessionStatus,
      reason: string,
    ) {
      const access = await authorize(user, offeringId);
      if (!access.canManageSession) {
        throw new TelegramClassDeliveryAccessError(
          "Only programme management can change the official class-session status",
        );
      }

      const result = await offerings().classDelivery.saveClassSessionStatus(
        offeringId,
        date,
        status,
        reason,
        user.id,
      );

      await audit({
        identityId: user.identity.id,
        userId: user.id,
        telegramUserId: user.identity.telegramUserId,
        action: "class_session_status_recorded",
        resourceType: "Offering",
        resourceId: offeringId,
        metadata: {
          offeringId,
          date,
          resultingState: result.session.status,
          reason: result.session.reason,
          actorKind: access.actorKind,
          changed: result.changed,
        },
      });

      const confirmation = await offerings().classDelivery.getLecturerArrival(offeringId, date);
      return { ...result, access, confirmation };
    },
  };
}

export const telegramClassDeliveryService = createTelegramClassDeliveryService();

export function telegramClassDeliveryErrorStatus(error: unknown): number | null {
  if (error instanceof TelegramClassDeliveryNotFoundError) return 404;
  if (error instanceof TelegramClassDeliveryAccessError) return 403;
  return null;
}
