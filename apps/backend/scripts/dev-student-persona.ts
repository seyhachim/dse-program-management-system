import { PrismaClient } from "@prisma/client";
import { defaultProgrammeIdForRole, signToken } from "../src/core/auth/token.ts";
import { assertDevAuthMode, parseStudentPersonaArgs } from "./dev-auth-cli.ts";

/**
 * Re-links an existing seeded Student fixture to a chosen local-dev User and
 * mints a student-only JWT. This intentionally reuses seeded academic fixture
 * data instead of creating synthetic enrollments/results.
 *
 * Usage:
 *   bun run dev:student-persona --email developer@example.com
 *   bun run dev:student-persona --email developer@example.com --student-email ada@dse.dev
 *
 * The command is hard-blocked unless AUTH_MODE=dev.
 */
async function main() {
  assertDevAuthMode(process.env.AUTH_MODE);
  const { email, studentEmail } = parseStudentPersonaArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const programmeId = defaultProgrammeIdForRole("student");
    if (!programmeId) {
      throw new Error("Student role must be programme-scoped");
    }

    const persona = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { email: studentEmail },
        select: {
          id: true,
          name: true,
          email: true,
          studentId: true,
          status: true,
          userId: true,
        },
      });
      if (!student) {
        throw new Error(`Seeded Student fixture "${studentEmail}" was not found. Run \`bun run seed\` first.`);
      }
      if (student.status !== "Active") {
        throw new Error(`Student fixture "${studentEmail}" is ${student.status}; only Active fixtures can be mocked.`);
      }

      const role = await tx.role.findUnique({ where: { slug: "student" }, select: { id: true } });
      const programme = await tx.programme.findUnique({ where: { id: programmeId }, select: { id: true } });
      if (!role || !programme) {
        throw new Error("Seeded student role/programme is missing. Run `bun run seed` first.");
      }

      const existingUser = await tx.user.findUnique({
        where: { email },
        include: { studentProfile: { select: { id: true, email: true, name: true } } },
      });
      if (existingUser?.studentProfile && existingUser.studentProfile.id !== student.id) {
        throw new Error(
          `User "${email}" is already linked to a different Student profile (${existingUser.studentProfile.email ?? existingUser.studentProfile.name}).`,
        );
      }

      const user = existingUser ?? await tx.user.create({
        data: { email, name: "Dev Student Persona" },
      });

      await tx.userRoleAssignment.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: { programmeId },
        create: { userId: user.id, roleId: role.id, programmeId },
      });

      if (student.userId !== user.id) {
        await tx.student.update({
          where: { id: student.id },
          data: { userId: user.id },
        });
      }

      return { user, student, programmeId };
    });

    const token = signToken({
      id: persona.user.id,
      email: persona.user.email,
      roles: ["student"],
      programmeRoles: [{ role: "student", programmeId: persona.programmeId }],
    });

    console.error(
      [
        `Dev Student Portal persona ready for ${persona.user.email}.`,
        `Using seeded fixture: ${persona.student.name} (${persona.student.studentId ?? "Pending ID"}, ${persona.student.email}).`,
        "Only the dev User role/link was changed; enrollment, attendance, results, CourseSpecs, curriculum, and QA records were not rewritten.",
        "Paste the token below into apps/frontend/.env.local as NEXT_PUBLIC_DEV_TOKEN.",
        "",
      ].join("\n"),
    );
    console.log(token);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
