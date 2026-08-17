import { describe, expect, test } from "bun:test";
import type { ClassResponsibilityRole, LecturerArrivalStatus } from "@dse-pms/shared-types";
import type { TelegramSessionUser } from "./session.ts";
import {
  createTelegramClassDeliveryService,
  TelegramClassDeliveryAccessError,
} from "./class-delivery-service.ts";

const offeringId = "550e8400-e29b-41d4-a716-446655440001";
const confirmationId = "550e8400-e29b-41d4-a716-446655440002";
const programmeId = "dse";

function user(role: "student" | "lecturer" = "student", id = crypto.randomUUID()): TelegramSessionUser {
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
  existingStatus?: LecturerArrivalStatus | null;
  saveChanged?: boolean;
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
        if (!options.existingStatus) return null;
        return {
          id: confirmationId,
          offeringId: id,
          date,
          status: options.existingStatus,
          recordedBy: { id: crypto.randomUUID(), name: "Recorder" },
          recordedAt: "2026-08-17T01:00:00.000Z",
          updatedAt: "2026-08-17T01:00:00.000Z",
        };
      },
      async saveLecturerArrival(id: string, date: string, status: LecturerArrivalStatus, actorId: string) {
        return {
          changed: options.saveChanged ?? true,
          confirmation: {
            id: confirmationId,
            offeringId: id,
            date,
            status,
            recordedBy: { id: actorId, name: "Recorder" },
            recordedAt: "2026-08-17T01:00:00.000Z",
            updatedAt: "2026-08-17T01:00:00.000Z",
          },
        };
      },
    },
  };
  const service = createTelegramClassDeliveryService(offerings, async (event) => { audits.push(event); });
  return { service, audits, responsibilityChecks: () => responsibilityChecks };
}

describe("Telegram class delivery authorization", () => {
  test("assigned lecturer can confirm without monitor authority", async () => {
    const lecturer = user("lecturer");
    const { service, responsibilityChecks } = harness({ lecturerId: lecturer.id });
    const result = await service.save(lecturer, offeringId, "2026-08-17", "Present");
    expect(result.access.actorKind).toBe("Lecturer");
    expect(responsibilityChecks()).toBe(0);
  });

  for (const role of ["ClassMonitor", "SubClassMonitor"] as const) {
    test(`${role} can confirm only through canonical active responsibility`, async () => {
      const monitor = user("student");
      const { service, audits } = harness({ monitorRole: role, monitorAllowed: true });
      const result = await service.save(monitor, offeringId, "2026-08-17", "NotYet");
      expect(result.access.actorKind).toBe(role);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        userId: monitor.id,
        telegramUserId: monitor.identity.telegramUserId,
        action: "lecturer_arrival_confirmed",
        resourceType: "Offering",
        resourceId: offeringId,
        metadata: { resultingState: "NotYet", actorKind: role, changed: true },
      });
    });
  }

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
    await expect(service.save(monitor, offeringId, "2026-08-17", "Present")).rejects.toBeInstanceOf(
      TelegramClassDeliveryAccessError,
    );
  });

  test("cross-offering ids fail without leaking authority", async () => {
    const monitor = user("student");
    const { service } = harness({ monitorRole: "ClassMonitor" });
    await expect(
      service.get(monitor, "550e8400-e29b-41d4-a716-446655440099", "2026-08-17"),
    ).rejects.toThrow("Offering not found");
  });

  test("duplicate same-state submissions stay idempotent and remain auditable", async () => {
    const monitor = user("student");
    const { service, audits } = harness({
      monitorRole: "ClassMonitor",
      monitorAllowed: true,
      existingStatus: "Present",
      saveChanged: false,
    });
    const result = await service.save(monitor, offeringId, "2026-08-17", "Present");
    expect(result.changed).toBe(false);
    expect(result.confirmation.status).toBe("Present");
    expect(audits[0]?.metadata).toMatchObject({ resultingState: "Present", changed: false });
  });
});
