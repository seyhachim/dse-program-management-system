import type {
  InventoryCapability,
  ResourceResponsibilityType,
} from "@dse-pms/shared-types";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import { hasRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";

const ALL_CAPABILITIES: InventoryCapability[] = [
  "inventory:read",
  "inventory:write",
  "inventory:receive",
  "inventory:approve",
  "inventory:maintain",
];

const COORDINATOR_CAPABILITIES: InventoryCapability[] = [
  "inventory:read",
  "inventory:write",
  "inventory:receive",
  "inventory:maintain",
];

const CUSTODIAN_CAPABILITIES: InventoryCapability[] = [
  "inventory:read",
  "inventory:maintain",
];

const READ_ROLES: Role[] = [
  "program_secretary",
  "qa_reviewer",
  "qa_contributor",
];

export function capabilitiesForResourceContext(
  user: AuthUser,
  programmeId: string,
  responsibilities: ResourceResponsibilityType[],
): InventoryCapability[] {
  const result = new Set<InventoryCapability>();

  if (
    hasRoleInProgramme(user, "admin", programmeId) ||
    hasRoleInProgramme(user, "program_coordinator", programmeId)
  ) {
    return [...ALL_CAPABILITIES];
  }

  if (READ_ROLES.some((role) => hasRoleInProgramme(user, role, programmeId))) {
    result.add("inventory:read");
  }

  if (responsibilities.includes("RESOURCE_COORDINATOR")) {
    for (const capability of COORDINATOR_CAPABILITIES) result.add(capability);
  }

  if (responsibilities.includes("LAB_CUSTODIAN")) {
    for (const capability of CUSTODIAN_CAPABILITIES) result.add(capability);
  }

  return [...result];
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function activeResourceResponsibilities(
  userId: string,
  programmeId: string,
  asOf: Date = startOfTodayUtc(),
): Promise<ResourceResponsibilityType[]> {
  const rows = await prisma.resourceResponsibilityAssignment.findMany({
    where: {
      userId,
      programmeId,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    select: { responsibility: true },
    distinct: ["responsibility"],
  });
  return rows.map((row) => row.responsibility);
}

export async function resolveInventoryCapabilities(
  user: AuthUser,
  programmeId: string,
): Promise<{
  capabilities: InventoryCapability[];
  responsibilities: ResourceResponsibilityType[];
}> {
  const responsibilities = await activeResourceResponsibilities(user.id, programmeId);
  return {
    capabilities: capabilitiesForResourceContext(user, programmeId, responsibilities),
    responsibilities,
  };
}

export async function hasInventoryCapability(
  user: AuthUser,
  programmeId: string,
  capability: InventoryCapability,
): Promise<boolean> {
  const resolved = await resolveInventoryCapabilities(user, programmeId);
  return resolved.capabilities.includes(capability);
}
