import type { NextFunction, Request, Response } from "express";
import type { Role } from "../auth/token.ts";
import { prisma } from "../db/prisma.ts";

/**
 * Kept only as a rollback reference for issue #67's cutover — no longer read.
 * The enforced source of truth is now the RolePermission cache below, built
 * from the DB rows this map used to mirror. Pinned to the three roles that
 * existed pre-#67/pre-#101 (not the current `Role` type) since it documents
 * that frozen moment, not today's role set.
 */
export const ROLE_PERMISSIONS_LEGACY: Record<"admin" | "lecturer" | "student", string[]> = {
  admin: [
    "accounts:create",
    "students:read",
    "students:write",
    "courses:read",
    "courses:write",
    "courses:manage",
    "offerings:read",
    "offerings:write",
    "offerings:manage",
    "lecturers:read",
    "lecturers:write",
    "methods:read",
    "methods:write",
    "rubrics:read",
    "rubrics:write",
  ],
  lecturer: [
    "students:read",
    "courses:read",
    "courses:write",
    "offerings:read",
    "offerings:write",
    "lecturers:read",
    "methods:read",
    "methods:write",
    "rubrics:read",
    "rubrics:write",
  ],
  student: [
    "students:read",
    "courses:read",
    "offerings:read",
    "lecturers:read",
    "methods:read",
    "rubrics:read",
  ],
};

/**
 * Role -> permission set, loaded once from Role/Permission/RolePermission
 * (issue #67) and cached in memory for the life of the process. Built lazily on
 * first use rather than at import time, so a cold DB connection can't block
 * server startup. No invalidation: nothing mutates these tables at runtime yet
 * (there's no admin UI to edit them), so the cache never goes stale in practice.
 */
let permissionCache: Promise<Record<string, Set<string>>> | undefined;

function loadPermissionCache(): Promise<Record<string, Set<string>>> {
  permissionCache ??= prisma.role
    .findMany({ include: { rolePermissions: { include: { permission: true } } } })
    .then((roles) => {
      const cache: Record<string, Set<string>> = {};
      for (const role of roles) {
        cache[role.slug] = new Set(role.rolePermissions.map((rp) => rp.permission.slug));
      }
      return cache;
    });
  return permissionCache;
}

/** True if any of `roles` grants `permission` (issue #77 phase B — a caller can hold more than one role). */
export async function roleHasPermission(roles: Role[], permission: string): Promise<boolean> {
  const cache = await loadPermissionCache();
  return roles.some((role) => cache[role]?.has(permission) ?? false);
}

/**
 * Guard factory: `requirePermission("students:write")`. Assumes `requireAuth`
 * ran first (so `req.user` is set); returns 403 when the role lacks the permission.
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!(await roleHasPermission(user.roles, permission))) {
      res.status(403).json({ error: `Missing permission: ${permission}` });
      return;
    }
    next();
  };
}
