import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const granularPermissions = [
  {
    slug: "qa:contribute",
    title: "Contribute to QA and SAR work",
    description:
      "Write assigned QA/SAR content and attach supporting evidence without programme-management authority.",
  },
  {
    slug: "qa:review",
    title: "Review QA and SAR work",
    description:
      "Review evidence findings and SAR submissions without changing programme administration.",
  },
  {
    slug: "qa:manage",
    title: "Manage programme QA workspace",
    description:
      "Manage QA cycles, assignments, and programme-level SAR workflow configuration.",
  },
] as const;

const rolePolicy: Record<string, string[]> = {
  admin: ["qa:contribute", "qa:review", "qa:manage"],
  program_coordinator: ["qa:contribute", "qa:review", "qa:manage"],
  qa_reviewer: ["qa:contribute", "qa:review"],
  qa_contributor: ["qa:read", "qa:contribute"],
};

async function main() {
  for (const permission of granularPermissions) {
    await prisma.permission.upsert({
      where: { slug: permission.slug },
      update: {
        title: permission.title,
        description: permission.description,
        active: true,
      },
      create: {
        slug: permission.slug,
        title: permission.title,
        description: permission.description,
        active: true,
      },
    });
  }

  await prisma.role.upsert({
    where: { slug: "qa_contributor" },
    update: {
      title: "QA Contributor",
      description:
        "Programme staff member who contributes to assigned AUN-QA evidence and SAR work without programme-management or approval authority.",
      active: true,
    },
    create: {
      slug: "qa_contributor",
      title: "QA Contributor",
      description:
        "Programme staff member who contributes to assigned AUN-QA evidence and SAR work without programme-management or approval authority.",
      active: true,
    },
  });

  for (const [roleSlug, permissionSlugs] of Object.entries(rolePolicy)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: roleSlug } });
    const permissions = await prisma.permission.findMany({
      where: { slug: { in: permissionSlugs } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Keep programme-management authority narrow even if a previous manual grant
  // accidentally assigned qa:manage to reviewer/contributor roles.
  const qaManage = await prisma.permission.findUniqueOrThrow({ where: { slug: "qa:manage" } });
  const nonManagers = await prisma.role.findMany({
    where: { slug: { in: ["qa_reviewer", "qa_contributor"] } },
    select: { id: true },
  });
  await prisma.rolePermission.deleteMany({
    where: {
      permissionId: qaManage.id,
      roleId: { in: nonManagers.map((role) => role.id) },
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
