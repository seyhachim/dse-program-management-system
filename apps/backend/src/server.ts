import express, { Router } from "express";
import { telegramManifest } from "@dse-pms/shared-types";
import { validateAuthConfig } from "./core/config/auth.ts";
import { prisma } from "./core/db/prisma.ts";
import { registry } from "./core/plugins/registry.ts";
import { attendanceService } from "./plugins/offerings/attendance-service.ts";
import { studentsPlugin } from "./plugins/students/index.ts";
import { validateTelegramConfig } from "./plugins/telegram/config.ts";

const UAT_DATES = ["2099-11-16", "2099-11-17", "2099-11-18"];

async function cleanup(offeringId: string, date: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sessions = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pms_attendance"."AttendanceSession"
      WHERE "offeringId" = ${offeringId} AND "sessionDate" = ${new Date(`${date}T00:00:00.000Z`)}
    `;
    const ids = sessions.map((row) => row.id);
    for (const sessionId of ids) {
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceCheckpoint" WHERE "sessionId" = ${sessionId}`;
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendancePermissionPending" WHERE "sessionId" = ${sessionId}`;
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceRecord" WHERE "sessionId" = ${sessionId}`;
      await tx.$executeRaw`DELETE FROM "pms_attendance"."AttendanceSession" WHERE "id" = ${sessionId}`;
    }
  });
}

async function runAttendance1147FullSaveBenchmark(): Promise<void> {
  const offeringRows = await prisma.$queryRaw<Array<{ offeringId: string }>>`
    SELECT o."id" AS "offeringId"
    FROM "Offering" o
    JOIN "Enrollment" e ON e."offeringId" = o."id"
    GROUP BY o."id"
    HAVING COUNT(*) = 43
    LIMIT 1
  `;
  const offeringId = offeringRows[0]?.offeringId;
  if (!offeringId) {
    console.log("[perf-uat-1147-full] skipped=no-43-student-offering");
    return;
  }

  const students = await prisma.$queryRaw<Array<{ studentId: string }>>`
    SELECT e."studentId"
    FROM "Enrollment" e
    WHERE e."offeringId" = ${offeringId}
    ORDER BY e."studentId"
  `;
  if (students.length !== 43) {
    console.log(`[perf-uat-1147-full] skipped=roster-size-${students.length}`);
    return;
  }

  const records = students.map((row, index) => {
    if (index >= 38) {
      return { studentId: row.studentId, status: null, permissionPending: true, note: "" };
    }
    const status = index < 20 ? "Present" : index < 30 ? "Late" : index < 35 ? "Absent" : "Excused";
    return { studentId: row.studentId, status, permissionPending: false, note: "" };
  });

  process.env.PERF_ATTENDANCE_SAVE_TIMING = "true";
  for (let index = 0; index < UAT_DATES.length; index += 1) {
    const date = UAT_DATES[index]!;
    await cleanup(offeringId, date);
    const startedAt = performance.now();
    const view = await attendanceService.save(
      offeringId,
      date,
      { expectedUpdatedAt: null, records },
    );
    const totalMs = performance.now() - startedAt;
    console.log(
      `[perf-uat-1147-full] run=${index + 1} total=${totalMs.toFixed(1)}ms present=${view.counts.Present} late=${view.counts.Late} absent=${view.counts.Absent} excused=${view.counts.Excused} pending=${view.counts.PermissionPending}`,
    );
    await cleanup(offeringId, date);
  }
}

validateAuthConfig();
validateTelegramConfig();

registry.register(studentsPlugin);
registry.register({
  manifest: telegramManifest,
  router: Router(),
  service: {
    notifications: {
      async deliverPermissionPending() {},
      async deliverAttendanceWarning() {},
    },
  },
});

await runAttendance1147FullSaveBenchmark();

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`DSE-PMS benchmark backend listening on http://localhost:${port}`);
});
