import { createApp } from "./core/app.ts";
import { signToken } from "./core/auth/token.ts";
import { validateAuthConfig } from "./core/config/auth.ts";
import { prisma } from "./core/db/prisma.ts";
import { validateTelegramConfig } from "./plugins/telegram/config.ts";
import { telegramBackendService } from "./plugins/telegram/index.ts";

const UAT_DATES = ["2099-11-19", "2099-11-20", "2099-11-21"];

async function cleanup(offeringId: string, date: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sessions = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pms_attendance"."AttendanceSession"
      WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${new Date(`${date}T00:00:00.000Z`)}
    `;
    for (const { id: sessionId } of sessions) {
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceCheckpoint" WHERE "sessionId" = ${sessionId}`;
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendancePermissionPending" WHERE "sessionId" = ${sessionId}`;
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceRecord" WHERE "sessionId" = ${sessionId}`;
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceSession" WHERE "id" = ${sessionId}`;
    }
  });
}

validateAuthConfig();
validateTelegramConfig();

// Test-service-only HTTP benchmark: switch to local dev verification after the
// real environment validated successfully. No production service/config is changed.
process.env.AUTH_MODE = "dev";
process.env.NODE_ENV = "development";
process.env.JWT_SECRET = "temporary-1147-disposable-http-benchmark-secret";
process.env.PERF_ATTENDANCE_SAVE_TIMING = "true";

// Avoid external Telegram/network side effects while retaining the warning-evaluation path.
telegramBackendService.notifications.deliverPermissionPending = async () => {};
telegramBackendService.notifications.deliverAttendanceWarning = async () => {};

const app = createApp();
const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, async () => {
  console.log(`DSE-PMS HTTP benchmark backend listening on http://localhost:${port}`);

  try {
    const offeringRows = await prisma.$queryRaw<Array<{ offeringId: string }>>`
      SELECT o."id" AS "offeringId"
      FROM "Offering" o
      JOIN "Enrollment" e ON e."offeringId" = o."id"
      GROUP BY o."id"
      HAVING COUNT(*) = 43
      LIMIT 1
    `;
    const offeringId = offeringRows[0]?.offeringId;
    const users = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email" FROM "User" ORDER BY "id" LIMIT 1
    `;
    if (!offeringId || !users[0]) {
      console.log("[perf-uat-1147-http] skipped=missing-fixture");
      return;
    }

    const students = await prisma.$queryRaw<Array<{ studentId: string }>>`
      SELECT e."studentId"
      FROM "Enrollment" e
      WHERE e."offeringId" = ${offeringId}
      ORDER BY e."studentId"
    `;
    if (students.length !== 43) {
      console.log(`[perf-uat-1147-http] skipped=roster-size-${students.length}`);
      return;
    }

    const records = students.map((row, index) => {
      if (index >= 38) return { studentId: row.studentId, status: null, permissionPending: true, note: "" };
      const status = index < 20 ? "Present" : index < 30 ? "Late" : index < 35 ? "Absent" : "Excused";
      return { studentId: row.studentId, status, permissionPending: false, note: "" };
    });
    const user = users[0];
    const token = signToken({
      id: user.id,
      email: user.email,
      roles: ["admin"],
      programmeRoles: [{ role: "admin", programmeId: null }],
    });

    for (let index = 0; index < UAT_DATES.length; index += 1) {
      const date = UAT_DATES[index]!;
      await cleanup(offeringId, date);
      const startedAt = performance.now();
      const response = await fetch(
        `http://127.0.0.1:${port}/api/offerings/${offeringId}/attendance/${date}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ expectedUpdatedAt: null, records }),
        },
      );
      const body = await response.json() as { counts?: Record<string, number>; error?: string };
      const totalMs = performance.now() - startedAt;
      console.log(
        `[perf-uat-1147-http] run=${index + 1} status=${response.status} total=${totalMs.toFixed(1)}ms serverTiming=${response.headers.get("server-timing") ?? "none"} present=${body.counts?.Present ?? -1} late=${body.counts?.Late ?? -1} absent=${body.counts?.Absent ?? -1} excused=${body.counts?.Excused ?? -1} pending=${body.counts?.PermissionPending ?? -1}`,
      );
      await cleanup(offeringId, date);
    }
  } catch (error) {
    console.error("[perf-uat-1147-http] failed", error);
  }
});

process.on("SIGTERM", () => server.close());
