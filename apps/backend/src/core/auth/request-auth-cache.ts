import type { Request } from "express";
import type { AuthUser } from "./token.ts";

const REQUEST_AUTH_USER = Symbol("dse-pms-request-auth-user");

type RequestWithAuthCache = Request & {
  [REQUEST_AUTH_USER]?: AuthUser;
};

/**
 * Resolve authentication at most once for one Express Request object.
 *
 * The Symbol is module-private and the property is non-enumerable, so it cannot
 * be supplied through HTTP input or leak through normal request serialization.
 * There is deliberately no process/global/TTL cache: a new HTTP request always
 * performs a fresh live identity verification.
 */
export async function resolveRequestAuthOnce(
  req: Request,
  resolve: () => Promise<AuthUser>,
): Promise<AuthUser> {
  const cached = (req as RequestWithAuthCache)[REQUEST_AUTH_USER];
  if (cached) {
    req.user = cached;
    return cached;
  }

  const user = await resolve();
  Object.defineProperty(req, REQUEST_AUTH_USER, {
    value: user,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  req.user = user;
  return user;
}
