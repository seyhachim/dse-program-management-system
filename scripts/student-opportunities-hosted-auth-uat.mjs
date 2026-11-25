/**
 * One-time isolated hosted Neon Auth + Render + Vercel release UAT.
 * Runs ONLY against the three exact staging hosts. No production credentials.
 * Test account passwords and JWTs exist only in memory, never in logs or artifacts.
 * An operator explicitly provisions the generated auth UUIDs in the isolated
 * staging PMS database while this script waits. Unknown accounts must fail shut.
 */
import { createRequire } from "node:module";
// Browser dependencies are pinned in the isolated tests/browser package.
const browserRequire = createRequire(new URL("../tests/browser/package.json", import.meta.url));
const { chromium } = browserRequire("@playwright/test");
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const PREVIEW = "https://dse-pms-git-feat-student-opportuniti-650954-seyhachims-projects.vercel.app";
const API = "https://dse-pms-staging-isolated-free.onrender.com";
const AUTH_ORIGIN = "https://ep-purple-scene-a1py5uzt.neonauth.ap-southeast-1.aws.neon.tech";
const RUN_ID = process.env.GITHUB_RUN_ID;
assert.match(RUN_ID ?? "", /^\d+$/, "Only a GitHub Actions staging run can execute this script");
assert.equal(process.env.GITHUB_EVENT_NAME, "pull_request");
assert.equal(process.env.GITHUB_HEAD_REF, "feat/student-opportunities-manual-mvp-1284");
assert.equal(process.env.GITHUB_BASE_REF, "main");

const browser = await chromium.launch({ headless: true });
const users = {};
const roles = ["coord", "secretary", "student", "outsider"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let draftId = null;

async function json(response) {
  try { return await response.json(); }
  catch { return null; }
}

async function backend(user, path, method = "GET", data) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Origin: PREVIEW,
      Authorization: "Bearer " + user.jwt,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(90000),
    cache: "no-store",
  });
  return { status: response.status, body: await json(response) };
}

function payloadFor(title) {
  return {
    programmeId: "dse", type: "hackathon", title,
    organizer: "Staging Release Test Organizer",
    summary: "Temporary hosted staging verification only. No real opportunity or student data.",
    eligibility: "Synthetic staged test only",
    sourceUrl: "https://example.com/staging-opportunity-test",
    applicationUrl: null, deadline: null,
  };
}

try {
  for (const role of roles) {
    const email = `opportunities-uat-${RUN_ID}-${role}@example.com`;
    const password = randomBytes(28).toString("hex") + "A1!";
    const context = await browser.newContext({
      baseURL: PREVIEW,
      viewport: { width: role === "student" ? 390 : 1366, height: 844 },
    });

    // Use native Fetch for API setup: Playwright 1.58's request cookie parser
    // crashes on the provider's Partitioned HttpOnly Set-Cookie header.
    const signup = await fetch(PREVIEW + "/staging-auth/sign-up/email", {
      method: "POST",
      headers: { Origin: PREVIEW, Referer: PREVIEW + "/login", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "STAGING UAT " + role.toUpperCase(), email, password }),
      signal: AbortSignal.timeout(90000),
      cache: "no-store",
    });
    const info = await json(signup);
    if (![200, 201].includes(signup.status)) {
      const reason = String(info?.message ?? info?.error?.message ?? info?.code ?? "no error details").slice(0, 180);
      throw new Error(`Staging auth signup failed role=${role} status=${signup.status} reason=${reason}`);
    }
    const id = info?.user?.id ?? info?.data?.user?.id;
    assert.match(id ?? "", /^[0-9a-f-]{36}$/i, `Missing staged auth UUID for ${role}`);

    const setCookies = signup.headers.getSetCookie();
    const cookie = setCookies.map((item) => item.split(";")[0]).filter(Boolean).join("; ");
    assert.ok(cookie.includes("session_token="), `No session cookie set for ${role}`);
    const session = await fetch(PREVIEW + "/staging-auth/get-session", {
      headers: { Origin: PREVIEW, Cookie: cookie },
      signal: AbortSignal.timeout(90000), cache: "no-store",
    });
    assert.equal(session.status, 200, `Provider get-session for ${role}`);
    assert.ok((await json(session))?.session, `Session cannot be recovered for ${role}`);

    const tokenResponse = await fetch(PREVIEW + "/staging-auth/token", {
      headers: { Origin: PREVIEW, Cookie: cookie },
      signal: AbortSignal.timeout(90000), cache: "no-store",
    });
    assert.equal(tokenResponse.status, 200, `JWT endpoint for ${role}`);
    const jwt = (await json(tokenResponse))?.token;
    assert.equal(typeof jwt, "string", `Signed JWT missing for ${role}`);
    assert.equal(jwt.split(".").length, 3, `Bearer is not a JWT for ${role}`);
    const header = JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    assert.equal(header.alg, "EdDSA");
    assert.equal(claims.sub, id);
    assert.equal(claims.email, email);
    assert.equal(claims.iss, AUTH_ORIGIN);
    assert.equal(claims.aud, AUTH_ORIGIN);

    users[role] = { id, email, password, jwt, context };
    const before = await backend(users[role], "/api/auth/me");
    assert.equal(before.status, 401, `New ${role} already had a PMS role; staging is not isolated`);
    // Only these nonsecret UUID/email values are safe to print.
    console.log(`PROVISION_IN_STAGING role=${role} auth_id=${id} email=${email}`);
  }

  console.log("STAGING UAT: awaiting manual role assignment in isolated Neon (max 10 minutes)");
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    const statuses = await Promise.all(["coord","secretary","student"].map(
      async (role) => (await backend(users[role], "/api/auth/me")).status,
    ));
    if (statuses.every((status) => status === 200)) { ready = true; break; }
    if (attempt % 12 === 0) console.log(`Waiting for isolated staging account roles: statuses=${statuses.join(",")}`);
    await sleep(5000);
  }
  assert.ok(ready, "Required staging staff/student accounts were not explicitly provisioned");

  const outsider = await backend(users.outsider, "/api/auth/me");
  assert.equal(outsider.status, 401, "Unprovisioned identity must be denied");
  const title = "UAT Only - " + RUN_ID + " - " + randomUUID();

  const created = await backend(users.coord, "/api/opportunities/manage", "POST", payloadFor(title));
  assert.equal(created.status, 201, "Coordinator cannot create draft: " + created.status);
  draftId = created.body?.id;
  assert.match(draftId ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(created.body.status, "Draft");
  const studentDraft = await backend(users.student, "/api/opportunities");
  assert.equal(studentDraft.status, 200);
  assert.ok(!studentDraft.body.some((item) => item.id === draftId), "Draft exposed to student");

  const secretaryCreate = await backend(users.secretary, "/api/opportunities/manage", "POST", payloadFor("Denied secretary " + RUN_ID));
  assert.equal(secretaryCreate.status, 403, "Secretary can create opportunities");
  const studentCreate = await backend(users.student, "/api/opportunities/manage", "POST", payloadFor("Denied student " + RUN_ID));
  assert.equal(studentCreate.status, 403, "Student can create opportunities");
  const outsiderList = await backend(users.outsider, "/api/opportunities");
  assert.equal(outsiderList.status, 401, "Outsider gained opportunities access");
  const crossProgramme = await backend(users.student, "/api/opportunities?programmeId=unauthorized");
  assert.equal(crossProgramme.status, 403, "Student can list other programmes");

  const published = await backend(users.coord, `/api/opportunities/manage/${draftId}/publish`, "POST", {});
  assert.equal(published.status, 200, "Coordinator publish failed: " + published.status);
  assert.equal(published.body?.status, "Published");
  const visible = await backend(users.student, "/api/opportunities");
  assert.equal(visible.status, 200);
  assert.ok(visible.body.some((item) => item.id === draftId), "Published opportunity missing from student feed");

  const fakeConsent = await backend(users.student, `/api/opportunities/${draftId}/experiences`, "POST", {
    evidenceId: randomUUID(), outcome: "Participant", consent: true,
  });
  assert.ok([400, 403].includes(fakeConsent.status), "Unverified portfolio evidence was accepted");

  // Actual hosted browser login: coordinator manage and student mobile browse.
  for (const role of ["coord","student"]) {
    const user = users[role];
    // This browser context was never logged in by the API setup. Exercise the
    // actual hosted email/password form as an independent session test.
    const page = await user.context.newPage();
    await page.goto(PREVIEW + "/login", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    const loginRequest = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/staging-auth/sign-in/email",
      { timeout: 45000 },
    );
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    const loginResponse = await loginRequest;
    assert.equal(loginResponse.status(), 200, `Browser login rejected for ${role}`);
    // Do not abort the asynchronous form login before the provider writes its
    // session cookie and the Next.js router completes the redirect.
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 45000 });
    const path = role === "coord" ? "/opportunities/manage" : "/opportunities";
    await page.goto(PREVIEW + path, { waitUntil: "domcontentloaded", timeout: 90000 });
    const heading = role === "coord" ? "Create a verified opportunity" : "Discover your next opportunity";
    try {
      await page.getByRole("heading", { name: heading }).waitFor({ state: "visible", timeout: 45000 });
    } catch {
      const currentPath = new URL(page.url()).pathname;
      const alerts = (await page.getByRole("alert").allTextContents()).join(" ").slice(0, 200);
      throw new Error(`Hosted UI failed role=${role} path=${currentPath} alert=${alerts}`);
    }
    if (role === "student") {
      await page.getByRole("searchbox", { name: "Search opportunities" }).fill(title);
      await page.getByRole("article").filter({ hasText: title }).waitFor({ state: "visible", timeout: 20000 });
      const layout = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert.ok(layout.content <= layout.width + 1, "Student mobile view overflows horizontally");
    }
    await page.close();
    console.log(`HOSTED_BROWSER_PASS role=${role} path=${path}`);
  }

  const archived = await backend(users.coord, `/api/opportunities/manage/${draftId}/archive`, "POST", {});
  assert.equal(archived.status, 200, "Cleanup archive failed");
  assert.equal(archived.body?.status, "Archived");
  const after = await backend(users.student, "/api/opportunities");
  assert.ok(!after.body.some((item) => item.id === draftId), "Archived opportunity remains visible");
  const hiddenDetail = await backend(users.student, `/api/opportunities/${draftId}`);
  assert.equal(hiddenDetail.status, 404, "Archived detail remains publicly readable");
  console.log("HOSTED_STAGING_UAT_PASS signed JWT, explicit identity, RBAC, publish, mobile browsing, archive");
} finally {
  // A failed browser assertion must never leave a synthetic staged opportunity
  // published to students. Use the normal audited staff archive endpoint.
  if (draftId && users.coord?.jwt) {
    try {
      const cleanup = await backend(users.coord, `/api/opportunities/manage/${draftId}/archive`, "POST", {});
      if (cleanup.status === 200) console.log("Archived temporary staging opportunity after UAT");
    } catch {
      console.error("Warning: test opportunity may require manual staging cleanup");
    }
  }
  // Test accounts remain only in the isolated staging system for review.
  await browser.close();
}
