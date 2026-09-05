# DSE PMS Progressive Web App

DSE PMS is installable as a Progressive Web App (PWA) while remaining the same Next.js application, backend, authentication system, permissions model, and academic source of truth.

## Product boundary

- **DSE PMS PWA** — primary full mobile/web experience.
- **Telegram Bot** — notifications, reminders, and deep links.
- **Telegram Mini App** — selected quick authenticated actions only.

The PWA does not create a second academic datastore or a second authorization path.

## Install behavior

Supported Chromium browsers can offer an **Install DSE PMS** action. Installed launches use standalone display mode and the same `/` application entry point. iOS/iPadOS users receive brief Safari **Share → Add to Home Screen** guidance.

The install suggestion is dismissible and only remembered for the current browser session. Normal browser use never depends on installation.

## Service-worker security policy

The service worker is intentionally conservative.

It may persist only:

- the data-free `/offline` page;
- DSE/RUPP public branding assets;
- hashed `/_next/static/*` build assets.

It does **not** persist:

- application navigation responses;
- `/api/*` responses;
- grades/results;
- attendance;
- permissions;
- student/lecturer records;
- CourseSpec authoring/review data;
- AUN-QA/SAR evidence or workflow data;
- arbitrary `/_next/image` responses;
- academic mutations.

All normal navigations are network-first. If the network is unavailable, the cached data-free offline page is shown instead of a stale authenticated page.

Authorization remains server-side. A cache hit never grants access.

## Update behavior

`/sw.js` is served with `Cache-Control: no-cache, no-store, must-revalidate` and registration uses `updateViaCache: "none"`. New deployments can therefore replace the service worker without depending on a stale HTTP-cached worker script.

The service worker removes older DSE PMS static-cache versions during activation.

## Verification

Repository checks:

```bash
bun test apps/frontend/pwa.test.mjs
bun run typecheck
bun run lint
bun run test
bun run build
bunx prisma validate --schema apps/backend/prisma/schema.prisma
```

Production/mobile smoke:

1. Deploy through the normal HTTPS frontend environment.
2. Open DSE PMS in Android Chrome.
3. Confirm the install suggestion or browser install action appears.
4. Install and launch from the phone home screen/app launcher.
5. Confirm it opens in standalone mode.
6. Sign in as a student and confirm the existing Student Portal/role authorization still controls access.
7. Sign in as staff and confirm the normal role-aware PMS routes remain available.
8. Turn off connectivity and navigate: confirm the explicit offline page appears and no stale protected academic screen is presented as current.
9. Restore connectivity and confirm normal navigation works again.
10. Sign out/change account and confirm no prior user's protected data is available offline.

A real-device install smoke is required before issue #841 is considered fully closed.
