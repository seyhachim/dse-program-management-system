import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissionTitles = {
  "inventory:read": "View programme resources and inventory",
  "inventory:write": "Manage programme resource catalogue and inventory records",
  "inventory:receive": "Record programme resource receipts",
  "inventory:approve": "Approve programme resource governance actions",
  "inventory:maintain": "Maintain resource condition and location records",
} as const;

type InventoryPermission = keyof typeof permissionTitles;

const desiredRolePermissions: Record<string, InventoryPermission[]> = {
  admin: [
    "inventory:read",
    "inventory:write",
    "inventory:receive",
    "inventory:approve",
    "inventory:maintain",
  ],
  program_coordinator: [
    "inventory:read",
    "inventory:write",
    "inventory:receive",
    "inventory:approve",
    "inventory:maintain",
  ],
  program_secretary: ["inventory:read"],
  qa_contributor: ["inventory:read"],
  qa_reviewer: ["inventory:read"],
};

async function main() {
  const permissions = new Map<string, string>();
  for (const [slug, title] of Object.entries(permissionTitles)) {
    const row = await prisma.permission.upsert({
      where: { slug },
      update: { title, active: true },
      create: { slug, title, active: true },
      select: { id: true, slug: true },
    });
    permissions.set(row.slug, row.id);
  }

  const roles = await prisma.role.findMany({
    where: { slug: { in: Object.keys(desiredRolePermissions) } },
    select: { id: true, slug: true },
  });

  for (const role of roles) {
    const desired = new Set(desiredRolePermissions[role.slug] ?? []);
    const desiredIds = [...desired]
      .map((slug) => permissions.get(slug))
      .filter((id): id is string => Boolean(id));

    if (desiredIds.length > 0) {
      for (const permissionId of desiredIds) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId },
          },
          update: {},
          create: { roleId: role.id, permissionId },
        });
      }
    }

    const allInventoryPermissionIds = [...permissions.values()];
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: {
          in: allInventoryPermissionIds.filter((id) => !desiredIds.includes(id)),
        },
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
