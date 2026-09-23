import { createApp } from "./core/app.ts";
import { validateAuthConfig } from "./core/config/auth.ts";
import { prisma } from "./core/db/prisma.ts";
import { studentAttendanceHistoryService } from "./plugins/offerings/student-attendance-history-service.ts";
import { validateTelegramConfig } from "./plugins/telegram/config.ts";

async function runAttendance1147ReadOnlyBenchmark(): Promise<void> {
  const offeringRows = await prisma.$queryRaw<Array<{ offeringId: string }>>`
    SELECT "offeringId"
    FROM "pms_attendance"."AttendanceSession"
    ORDER BY "sessionDate" DESC
    LIMIT 1
  `;
  const offeringId = offeringRows[0]?.offeringId;
  if (!offeringId) {
    console.log("[perf-uat-1147] skipped=no-attendance-session");
    return;
  }

  const students = await prisma.$queryRaw<Array<{ studentId: string }>>`
    SELECT "studentId"
    FROM "Enrollment"
    WHERE "offeringId" = ${offeringId}
    ORDER BY "studentId"
    LIMIT 18
  `;
  const studentIds = students.map((row) => row.studentId);
  if (studentIds.length === 0) {
    console.log("[perf-uat-1147] skipped=no-enrolled-students");
    return;
  }

  await prisma.$queryRaw`SELECT 1`;

  for (let run = 1; run <= 3; run += 1) {
    const sequentialStartedAt = performance.now();
    for (const studentId of studentIds) {
      await studentAttendanceHistoryService.healthForStudent(studentId, offeringId);
    }
    const sequentialMs = performance.now() - sequentialStartedAt;

    const bulkStartedAt = performance.now();
    await studentAttendanceHistoryService.warningHealthForStudents(studentIds, offeringId);
    const bulkMs = performance.now() - bulkStartedAt;

    console.log(
      `[perf-uat-1147] run=${run} students=${studentIds.length} sequential=${sequentialMs.toFixed(1)}ms bulk=${bulkMs.toFixed(1)}ms speedup=${(sequentialMs / Math.max(1, bulkMs)).toFixed(1)}x`,
    );
  }
}

validateAuthConfig();
validateTelegramConfig();

await runAttendance1147ReadOnlyBenchmark();

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`DSE-PMS backend listening on http://localhost:${port}`);
});
