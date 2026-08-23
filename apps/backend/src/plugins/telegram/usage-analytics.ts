import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Role, TelegramUsageEventType } from "@dse-pms/shared-types";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../core/db/prisma.ts";
import type { TelegramSessionUser } from "./session.ts";

export const TELEGRAM_USAGE_RETENTION_DAYS = 180;

const ROLE_PRIORITY: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_reviewer",
  "qa_contributor",
  "student",
];

let lastPurgeAt = 0;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface TelegramUsageContext {
  programmeId: string;
  actorRole: Role;
}

export interface ClassifiedTelegramUsage {
  eventType: TelegramUsageEventType;
  offeringId?: string;
}

function chooseRole(roles: Role[]): Role {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? roles[0] ?? "student";
}

export function analyticsProgrammeContexts(
  user: Pick<TelegramSessionUser, "roles" | "programmeRoles">,
): TelegramUsageContext[] {
  const programmeIds = [
    ...new Set(
      user.programmeRoles
        .map((assignment) => assignment.programmeId)
        .filter((programmeId): programmeId is string => Boolean(programmeId)),
    ),
  ];

  return programmeIds.map((programmeId) => {
    const programmeRoles = user.programmeRoles
      .filter((assignment) => assignment.programmeId === programmeId)
      .map((assignment) => assignment.role);
    return {
      programmeId,
      actorRole: chooseRole(programmeRoles.length ? programmeRoles : user.roles),
    };
  });
}

function normalizedMiniPath(req: Request): string {
  const pathname = req.originalUrl.split("?")[0] ?? req.path;
  const marker = "/mini";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : req.path;
}

export function classifyTelegramMiniAppUsage(req: Pick<Request, "method" | "originalUrl" | "path">): ClassifiedTelegramUsage | null {
  if (req.method !== "GET") return null;
  const path = normalizedMiniPath(req as Request);

  if (path === "/home") return { eventType: "HomeViewed" };
  if (path === "/schedule") return { eventType: "ScheduleViewed" };
  if (path === "/announcements") return { eventType: "AnnouncementsViewed" };
  if (path === "/results") return { eventType: "ResultsViewed" };
  if (path === "/surveys") return { eventType: "SurveysViewed" };
  if (path === "/assessment-deadlines") return { eventType: "AssessmentDeadlinesViewed" };
  if (path === "/lecturer-workload") return { eventType: "LecturerWorkloadViewed" };

  const classMatch = path.match(/^\/classes\/([^/]+)$/);
  if (classMatch?.[1]) {
    return { eventType: "ClassViewed", offeringId: decodeURIComponent(classMatch[1]) };
  }

  const attendanceHistoryMatch = path.match(/^\/student-attendance\/([^/]+)$/);
  if (attendanceHistoryMatch?.[1]) {
    return {
      eventType: "AttendanceHistoryViewed",
      offeringId: decodeURIComponent(attendanceHistoryMatch[1]),
    };
  }

  const attendanceRosterMatch = path.match(/^\/attendance\/([^/]+)\/[^/]+$/);
  if (attendanceRosterMatch?.[1]) {
    return {
      eventType: "AttendanceRosterViewed",
      offeringId: decodeURIComponent(attendanceRosterMatch[1]),
    };
  }

  return null;
}

async function purgeExpiredIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM public_analytics."TelegramUsageEvent"
    WHERE "createdAt" < NOW() - (${TELEGRAM_USAGE_RETENTION_DAYS} * INTERVAL '1 day')
  `);
}

async function persistTelegramUsage(
  user: TelegramSessionUser,
  eventType: TelegramUsageEventType,
  offeringId?: string,
): Promise<void> {
  const contexts = analyticsProgrammeContexts(user);
  if (!contexts.length) return;

  await purgeExpiredIfNeeded();
  for (const context of contexts) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO public_analytics."TelegramUsageEvent" (
        "id", "programmeId", "actorUserId", "actorRole", "eventType", "offeringId"
      ) VALUES (
        ${randomUUID()}, ${context.programmeId}, ${user.id}, ${context.actorRole},
        ${eventType}, ${offeringId ?? null}
      )
    `);
  }
}

/**
 * Analytics must never block or change a Telegram user workflow. The write is
 * deliberately fire-and-forget and errors are server-side only.
 */
export function recordTelegramUsage(
  user: TelegramSessionUser,
  eventType: TelegramUsageEventType,
  offeringId?: string,
): void {
  void persistTelegramUsage(user, eventType, offeringId).catch((error) => {
    console.error("Telegram usage analytics write failed", error);
  });
}

export function telegramUsageAnalyticsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const classified = classifyTelegramMiniAppUsage(req);
  if (!classified || !req.telegramUser) {
    next();
    return;
  }

  const user = req.telegramUser;
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      recordTelegramUsage(user, classified.eventType, classified.offeringId);
    }
  });
  next();
}
