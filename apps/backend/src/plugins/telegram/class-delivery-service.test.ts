import { describe, expect, test } from "bun:test";
import type {
  ClassResponsibilityRole,
  ClassSessionStatus,
  LecturerArrivalStatus,
} from "@dse-pms/shared-types";
import type { TelegramSessionUser } from "./session.ts";
import {
  createTelegramClassDeliveryService,
  TelegramClassDeliveryAccessError,
} from "./class-delivery-service.ts";

const offeringId = "550e8400-e29b-41d4-a716-446655440001";
const confirmationId = "550e8400-e29b-41d4-a716-446655440002";
const sessionId = "550e8400-e29b-41d4-a716-446655440003";
const programmeId = "dse";

type TestRole = "student" | "lecturer" | "admin" | "program_coordinator" | "program_secretary";

function user(role: TestRole = "student", id = crypto.randomUUID()): TelegramSessionUser {
  return {
    id,
    name: `Test ${role}`,
    email: `${id}@example.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
    identity: {
      id: crypto.randomUUID(),
      userId: id,
      telegramUserId: "123456789",
      telegramUsername: null,
      linkedAt: new Date(),
      lastVerifiedAt: new Date(),
      revokedAt: null,
    },
  };
}

function responsibility(role: ClassResponsibilityRole, userId: string) {
  return {
    id: crypto.randomUUID(),
    offeringId,
    role,
    student: {
      id: crypto.randomUUID(),
      userId,
      studentId: "DSE001",
      name: "Monitor Student",
    },
    assignedAt: new Date().toISOString(),
    assignedBy: { id: crypto.randomUUID(), name: "Coordinator" },
    revokedAt: null,
    revokedBy: null,
    revokeReason: "",
  };
}

function harness(options: {
  lecturerId?: string;
  monitorRole?: ClassResponsibilityRole;
  monitorAllowed?: boolean;
  existingArrivalStatus?: LecturerArrivalStatus | null;
  existingNote?: string;
  existingSessionStatus?: ClassSessionStatus | null;
  existingReason?: string;
  saveArrivalChanged?: boolean;
  saveSessionChanged?: boolean;
} = {}) {
  const audits: any[] = [];
  let responsibilityChecks = 0;
  const offerings = {
    async getById(id: string) {
      if (id !== offeringId) return null;
      return {
        id,
        course: { programmeId },
        lecturer: options.lecturerId ? { id: options.lecturerId } : null,
        coLecturers: [],
      };
    },
    classResponsibilities: {
      async assertActiveForUser(userId: string, id: string) {
        responsibilityChecks += 1;
        if (id !== offeringId || options.monitorAllowed === false || !options.monitorRole) {
          throw new Error("not active");
        }
        return responsibility(options.monitorRole, userId);
      },
    },
    classDelivery: {
      async getLecturerArrival(id: string, date: string) {
        if (!options.existingArrivalStatus) return null;
        return {
          id: confirmationId,
          offeringId: id,
          date,
          status: options.existingArrivalStatus,
          note: options.existingNote ?? "",
          recordedBy: { id: crypto.randomUUID(), name: "Recorder" },
          recordedAt: "2026-08-17T01:00:00.000Z",
          updatedAt: "2026-08-17T01:00:00.000Z",
        };
      },
      async getClassSessionStatus(id: string, date: string) {
        if (!options.existingSessionStatus) return null;
        return {
          id: sessionId,
          offeringId: id,
          date,
          status: options.existingSessionStatus,
          reason: options.existingReason ?? "",
          recordedBy: { id: crypto.randomUUID(), name: "Manager" },
          recordedAt: "2026-08-17T00:30:00.000Z",
          updatedAt: "2026-08-17T00:30:00.000Z",
        };
      },
      async saveLecturerArrival(
        id: string,
        date: string,
        status: LecturerArrivalStatus,
        note: string,
        actorId: string,
      ) {
        return {
          changed: options.saveArrivalChanged ?? true,
          confirmation: {
            id: confirmationId,
            offeringId: id,
            date,
            status,
            note,
            recordedBy: { id: actorId, name: "Recorder" },
            recordedAt: "2026-08-17T01:00:00.000Z",
            updatedAt: "2026-08-17T01:00:00.000Z",
          },
        };
      },
      async saveClassSessionStatus(
        id: string,
        date: string,
        status: ClassSessionStatus,
        reason: string,
        actorId: string,
      ) {
        return {
          changed: options.saveSessionChanged ?? true,
          session: {
            id: sessionId,
            offeringId: id,
            date,
            status,
            reason,
            recordedBy: { id: actorId, name: "Manager" },
            recordedAt: "2026-08-17T00:30:00.000Z",
            updatedAt: "2026-08-17T00:30:00.000Z",
          },
        };
      },
    },
  };
  const service = createTelegramClassDeliveryService(offerings, async (event) => { audits.push(event); });
  return { service, audits, responsibilityChecks: () => responsibilityChecks };
}

describe("Telegram class delivery authorization", () => {
  test("assigned lecturer can record arrival and optional note without monitor authority", async () => {
    const lecturer = user("lecturer");
    const { service, responsibilityChecks, audits } = harness({ lecturerId: lecturer.id });
    const result = await service.save(
      lecturer,
      offeringId,
      "2026-08-17",
      "Present",
      "Arrived before the lecture started",
    );
    expect(result.access).toMatchObject({
      actorKind: "Lecturer",
      canRecordArrival: true,
      canManageSession: false,
    });
    expect(result.confirmation.note).toBe("Arrived before the lecture started");
    expect(responsibilityChecks()).toBe(0);
    expect(audits[0]?.metadata).toMatchObject({
      resultingState: "Present",
      note: "Arrived before the lecture started",
      actorKind: "Lecturer",
    });
  });

  for (const role of ["ClassMonitor", "SubClassMonitor"] as const) {
    test(`${role} can record arrival only through canonical active responsibility`, async () => {
      const monitor = user("student");
      const { service, audits } = harness({ monitorRole: role, monitorAllowed: true });
      const result = await service.save(monitor, offeringId, "2026-08-17", "NotYet", "On the way");
      expect(result.access).toMatchObject({
        actorKind: role,
        canRecordArrival: true,
        canManageSession: false,
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        userId: monitor.id,
        telegramUserId: monitor.identity.telegramUserId,
        action: "lecturer_arrival_confirmed",
        resourceType: "Offering",
        resourceId: offeringId,
        metadata: { resultingState: "NotYet", note: "On the way", actorKind: role, changed: true },
      });
    });
  }

  test("programme manager can manage session status but cannot record lecturer arrival", async () => {
    const manager = user("program_coordinator");
    const { service, audits, responsibilityChecks } = harness();

    const session = await service.saveSession(
      manager,
      offeringId,
      "2026-08-17",
      "Holiday",
      "National holiday",
    );
    expect(session.access).toMatchObject({
      actorKind: "ProgrammeManager",
      canRecordArrival: false,
      canManageSession: true,
    });
    expect(session.session).toMatchObject({ status: "Holiday", reason: "National holiday" });
    expect(audits[0]?.action).toBe("class_session_status_recorded");
    expect(audits[0]?.metadata).toMatchObject({
      resultingState: "Holiday",
      reason: "National holiday",
      actorKind: "ProgrammeManager",
      changed: true,
    });
    expect(responsibilityChecks()).toBe(0);

    await expect(
      service.save(manager, offeringId, "2026-08-17", "Present", ""),
    ).rejects.toBeInstanceOf(TelegramClassDeliveryAccessError);
  });

  test("monitor cannot change official session status", async () => {
    const monitor = user("student");
    const { service } = harness({ monitorRole: "ClassMonitor", monitorAllowed: true });
    await expect(
      service.saveSession(monitor, offeringId, "2026-08-17", "Cancelled", "Lecturer unavailable"),
    ).rejects.toBeInstanceOf(TelegramClassDeliveryAccessError);
  });

  test("session exception blocks lecturer-arrival mutation", async () => {
    const monitor = user("student");
    const { service } = harness({
      monitorRole: "ClassMonitor",
      monitorAllowed: true,
      existingSessionStatus: "Holiday",
      existingReason: "National holiday",
    });
    await expect(
      service.save(monitor, offeringId, "2026-08-17", "Present", ""),
    ).rejects.toThrow("not applicable");
  });

  test("assigned lecturer who also has a programme-wide role can manage both paths", async () => {
    const lecturerManager = user("program_coordinator");
    const { service } = harness({ lecturerId: lecturerManager.id });
    const access = await service.get(lecturerManager, offeringId, "2026-08-17");
    expect(access.access).toMatchObject({
      actorKind: "Lecturer",
      canRecordArrival: true,
      canManageSession: true,
    });
  });

  test("unrelated student fails closed", async () => {
    const student = user("student");
    const { service } = harness({ monitorAllowed: false });
    await expect(service.get(student, offeringId, "2026-08-17")).rejects.toBeInstanceOf(
      TelegramClassDeliveryAccessError,
    );
  });

  test("removed enrollment or revoked responsibility fails closed on the next request", async () => {
    const monitor = user("student");
    const { service } = harness({ monitorRole: "ClassMonitor", monitorAllowed: false });
    await expect(
      service.save(monitor, offeringId, "2026-08-17", "Present", ""),
    ).rejects.toBeInstanceOf(TelegramClassDeliveryAccessError);
  });

  test("cross-offering ids fail without leaking authority", async () => {
    const monitor = user("student");
    const { service } = harness({ monitorRole: "ClassMonitor" });
    await expect(
      service.get(monitor, "550e8400-e29b-41d4-a716-446655440099", "2026-08-17"),
    ).rejects.toThrow("Offering not found");
  });

  test("duplicate same-state and same-note submissions stay idempotent and auditable", async () => {
    const monitor = user("student");
    const { service, audits } = harness({
      monitorRole: "ClassMonitor",
      monitorAllowed: true,
      existingArrivalStatus: "Present",
      existingNote: "Already here",
      saveArrivalChanged: false,
    });
    const result = await service.save(monitor, offeringId, "2026-08-17", "Present", "Already here");
    expect(result.changed).toBe(false);
    expect(result.confirmation).toMatchObject({ status: "Present", note: "Already here" });
    expect(audits[0]?.metadata).toMatchObject({ resultingState: "Present", changed: false });
  });

  test("duplicate session state and reason stay idempotent and auditable", async () => {
    const manager = user("admin");
    const { service, audits } = harness({ saveSessionChanged: false });
    const result = await service.saveSession(
      manager,
      offeringId,
      "2026-08-17",
      "Rescheduled",
      "Moved to Friday",
    );
    expect(result.changed).toBe(false);
    expect(result.session).toMatchObject({ status: "Rescheduled", reason: "Moved to Friday" });
    expect(audits[0]?.metadata).toMatchObject({ resultingState: "Rescheduled", changed: false });
  });
});
