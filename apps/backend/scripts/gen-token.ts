import { PrismaClient } from "@prisma/client";
import { signToken, type Role } from "../src/core/auth/token.ts";

/**
 * Mints a dev JWT for a seeded user of the given role. Usage:
 *   bun run gen-token --role admin
 *   bun run gen-token             # defaults to admin
 *
 * Paste the printed token into apps/frontend/.env.local as NEXT_PUBLIC_DEV_TOKEN.
 * This is a temporary stand-in for a real login flow (Supabase) later.
 */
const prisma = new PrismaClient();

const ROLES: Role[] = ["admin", "program_coordinator", "program_secretary", "lecturer", "qa_reviewer", "student"];

function parseRole(): Role {
  const idx = process.argv.indexOf("--role");
  const value = idx >= 0 ? process.argv[idx + 1] : "admin";
  if (!ROLES.includes(value as Role)) {
    console.error(`Invalid role "${value}". Use one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  return value as Role;
}

async function main() {
  const role = parseRole();
  // Query through the join table (issue #77 phase B is the enforcement source
  // of truth now), not the legacy `role` enum column. programmeId comes along
  // on the same row (issue #147) so the minted token carries real scope.
  const user = await prisma.user.findFirst({
    where: { roleAssignments: { some: { role: { slug: role } } } },
    include: { roleAssignments: { where: { role: { slug: role } }, select: { programmeId: true } } },
  });
  if (!user) {
    console.error(`No seeded user with role "${role}". Run \`bun run seed\` first.`);
    process.exit(1);
  }
  const programmeId = user.roleAssignments[0]?.programmeId ?? null;
  const token = signToken({
    id: user.id,
    email: user.email,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  });
  // Print only the token on the last line so it's easy to copy/pipe.
  console.error(`Token for ${user.email} (${role}), valid 7d:\n`);
  console.log(token);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
