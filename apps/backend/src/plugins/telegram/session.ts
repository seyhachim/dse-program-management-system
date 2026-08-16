import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { ProgrammeRoleAssignment, Role } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { telegramIdentityStore, type TelegramIdentityRecord } from "./identity-store.ts";

const SESSION_TTL_SECONDS = 30 * 60;

export interface TelegramSessionUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  programmeRoles: ProgrammeRoleAssignment[];
  identity: TelegramIdentityRecord;
}

declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramSessionUser;
    }
  }
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required for Telegram Mini App sessions");
  return value;
}

export function issueTelegramSession(identity: TelegramIdentityRecord) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = jwt.sign(
    {
      aud: "telegram-mini-app",
      identityId: identity.id,
      telegramUserId: identity.telegramUserId,
    },
    secret(),
    { subject: identity.userId, expiresIn: SESSION_TTL_SECONDS },
  );
  return { token, expiresAt };
}

export async function resolveTelegramSession(token: string): Promise<TelegramSessionUser> {
  const payload = jwt.verify(token, secret(), { audience: "telegram-mini-app" }) as jwt.JwtPayload;
  if (
    !payload.sub ||
    typeof payload.identityId !== "string" ||
    typeof payload.telegramUserId !== "string"
  ) {
    throw new Error("Malformed Telegram session");
  }

  const identity = await telegramIdentityStore.findActiveByTelegramUserId(payload.telegramUserId);
  if (!identity || identity.id !== payload.identityId || identity.userId !== payload.sub) {
    throw new Error("Telegram session has been revoked");
  }

  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    include: { roleAssignments: { include: { role: true } } },
  });
  if (!user) throw new Error("PMS user no longer exists");

  const programmeRoles = user.roleAssignments.map((assignment) => ({
    role: assignment.role.slug as Role,
    programmeId: assignment.programmeId,
  }));
  const roles = [...new Set(programmeRoles.map((assignment) => assignment.role))];
  if (!roles.length) throw new Error("PMS user has no active roles");

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles,
    programmeRoles,
    identity,
  };
}

export async function requireTelegramSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    res.status(401).json({
      error: { code: "TELEGRAM_SESSION_INVALID", message: "Telegram session is required" },
    });
    return;
  }
  try {
    req.telegramUser = await resolveTelegramSession(token);
    next();
  } catch {
    res.status(401).json({
      error: { code: "TELEGRAM_SESSION_INVALID", message: "Telegram session is invalid or revoked" },
    });
  }
}
