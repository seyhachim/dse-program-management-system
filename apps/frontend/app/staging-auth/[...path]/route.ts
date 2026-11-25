import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGING_HOST = "dse-pms-git-uat-annual1299-seyhachims-projects.vercel.app";
const STAGING_ORIGIN = "https://" + STAGING_HOST;
const STAGING_API = "https://dse-pms-annual1299-uat.onrender.com";
const NEON_AUTH = "https://ep-old-thunder-a1vt6lwv.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth";

/**
 * Keep the hosted Neon Auth upstream's actual Host. An external Next.js rewrite
 * sends Vercel forwarding headers upstream, causing Better Auth INVALID_HOSTNAME.
 * Only the intended staged sign-in/session endpoints are supported here.
 * Production Supabase never uses this handler.
 */
const ALLOWED: Record<string, string> = {
  "get-session": "GET",
  token: "GET",
  "sign-in/email": "POST",
  "sign-up/email": "POST",
  "sign-out": "POST",
};

function approved(request: NextRequest): boolean {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.NEXT_PUBLIC_STAGING_MODE === "true" &&
    process.env.NEXT_PUBLIC_AUTH_MODE === "neon-staging" &&
    process.env.NEXT_PUBLIC_API_URL === STAGING_API &&
    process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL === NEON_AUTH &&
    request.nextUrl.origin === STAGING_ORIGIN &&
    request.headers.get("host") === STAGING_HOST;
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!approved(request)) return new Response(null, { status: 404 });

  const { path } = await context.params;
  const action = Array.isArray(path) ? path.join("/") : "";
  if (ALLOWED[action] !== request.method) return new Response(null, { status: 404 });

  // A user-supplied Host / X-Forwarded-Host must NEVER be passed to Neon Auth.
  // POSTs must originate from the exact staging preview, not an attacker site.
  const origin = request.headers.get("origin");
  if (origin && origin !== STAGING_ORIGIN) return new Response(null, { status: 403 });
  if (request.method === "POST" && origin !== STAGING_ORIGIN) {
    return new Response(null, { status: 403 });
  }

  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Origin", STAGING_ORIGIN);
  headers.set("Referer", STAGING_ORIGIN + "/login");
  const incomingCookie = request.headers.get("cookie");
  if (incomingCookie) headers.set("Cookie", incomingCookie);
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("User-Agent", userAgent);

  let body: ArrayBuffer | undefined;
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("application/json")) {
      return Response.json({ error: "Expected JSON" }, { status: 415 });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > 12_000) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    headers.set("Content-Type", "application/json");
  }

  try {
    const upstream = await fetch(NEON_AUTH + "/" + action, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return Response.json({ error: "Unexpected authentication redirect" }, { status: 502 });
    }
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);
    // Multiple HttpOnly session cookies must survive the first-party proxy.
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append("Set-Cookie", cookie);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "Staging authentication service unavailable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
