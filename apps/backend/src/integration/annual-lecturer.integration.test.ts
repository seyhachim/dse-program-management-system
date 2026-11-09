import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import type { AuthUser, Role } from "../core/auth/token.ts";
import { signToken } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

const integrationDescribe = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const TEST_SECRET = "annual-lecturer-integration-secret-at-least-32-characters";
type HttpResponse = { status: number; body: unknown };
type StaffRow = {
  lecturerId: string; classification: string; submissionStatus: string;
  teaching: Array<{ offeringId: string; confirmed: boolean; reviewId: string | null }>;
  evidence: Array<{ id: string; verificationStatus: string }>;
};
type Report = {
  academicYear: { id: string; label: string };
  statistics: {
    activeTeaching: number; otherContributors: number; unreported: number;
    distinctPublications: number; verifiedCpdActivities: number;
  };
  staff: StaffRow[];
  releaseVersion: number | null;
};

integrationDescribe("annual lecturer activity and report lifecycle (#1298)", () => {
  let server: Server;
  let baseUrl = "";
  let lecturer: AuthUser;
  let contributor: AuthUser;
  let coordinator: AuthUser;
  let student: AuthUser;
  let yearId = "";
  let nextYearId = "";
  let offeringId = "";
  const suffix = randomUUID().slice(0, 8);
  const doi = "10.9999/annual-" + suffix;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;
    [lecturer, contributor, coordinator, student] = await Promise.all([
      loadAuthUser("lecturer@dse.dev"), loadAuthUser("hopper.lecturer@dse.dev"),
      loadAuthUser("coordinator@dse.dev"), loadAuthUser("student@dse.dev"),
    ]);
    const y1 = await prisma.academicYear.create({
      data: { programmeId: "dse", label: "2097–2098", startYear: 2097, endYear: 2098 },
    });
    yearId = y1.id;
    const y2 = await prisma.academicYear.create({
      data: { programmeId: "dse", label: "2098–2099", startYear: 2098, endYear: 2099 },
    });
    nextYearId = y2.id;
    const course = await prisma.course.create({
      data: { programmeId: "dse", code: "SYNA" + suffix.toUpperCase(), title: "Synthetic annual test course" },
    });
    const offering = await prisma.offering.create({
      data: { courseId: course.id, lecturerId: lecturer.id,
        term: "2097–2098", sectionCode: "A", status: "Completed" },
    });
    offeringId = offering.id;
    const app: Express = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
    await prisma.$disconnect();
  });

  test("review, deduplication, historical teaching, evidence and versioned export", async () => {
    const lt = signToken(lecturer), ct = signToken(contributor),
      rt = signToken(coordinator), st = signToken(student);
    expect((await request(`/api/lecturers/annual/${yearId}/summary`, st)).status).toBe(403);
    expect((await request("/api/lecturers/annual/years", lt)).status).toBe(200);

    const before = (await request(`/api/lecturers/annual/${yearId}/summary`, rt)).body as Report;
    expect(before.statistics.activeTeaching).toBe(0);
    expect(before.staff.find(s => s.lecturerId === lecturer.id)?.submissionStatus).toBe("unreported");

    const teach = { lecturerId: lecturer.id, offeringId,
      verdict: "confirmed", reason: "Verified synthetic teaching",
      evidenceUrl: "https://example.invalid/teaching" };
    expect((await request(`/api/lecturers/annual/${yearId}/review-teaching`, lt, "POST", teach)).status).toBe(403);
    expect((await request(`/api/lecturers/annual/${yearId}/review-teaching`, rt, "POST", teach)).status).toBe(204);

    const pub = await request("/api/lecturers/me/portfolio-items", ct, "POST", {
      kind: "publication", title: "Joint synthetic paper", organization: "DSE",
      identifier: doi, url: "https://example.invalid/paper", startDate: "2098-02-14",
    });
    expect(pub.status).toBe(201);
    const pubId = (pub.body as { id: string }).id;
    expect((await request(`/api/lecturers/annual/${yearId}/me/evidence`, ct, "POST", { itemId: pubId })).status).toBe(204);
    expect((await request(`/api/lecturers/annual/${yearId}/me/evidence`, lt, "POST", { itemId: pubId })).status).toBe(404);
    expect((await request(`/api/lecturers/${contributor.id}/portfolio-items/${pubId}/review`, rt,
      "POST", { action: "verified", note: "DOI checked" })).status).toBe(200);

    const unsupported = await request("/api/lecturers/me/portfolio-items", ct, "POST", {
      kind: "professional_development", title: "Unsupported synthetic workshop",
      startDate: "2098-01-10", url: "https://example.invalid/workshop",
    });
    expect(unsupported.status).toBe(201);
    const badId = (unsupported.body as { id: string }).id;
    expect((await request(`/api/lecturers/annual/${yearId}/me/evidence`, ct, "POST", { itemId: badId })).status).toBe(204);
    expect((await request(`/api/lecturers/${contributor.id}/portfolio-items/${badId}/review`, rt,
      "POST", { action: "rejected", note: "No supporting workshop record" })).status).toBe(200);

    const coauthored = await request("/api/lecturers/me/portfolio-items", lt, "POST", {
      kind: "publication", title: "Joint synthetic paper", organization: "DSE",
      identifier: "https://doi.org/" + doi.toUpperCase(),
      url: "https://example.invalid/coauthor", startDate: "2098-02-14",
    });
    expect(coauthored.status).toBe(201);
    const coauthorId = (coauthored.body as { id: string }).id;
    expect((await request(`/api/lecturers/annual/${yearId}/me/evidence`, lt, "POST", { itemId: coauthorId })).status).toBe(204);
    expect((await request(`/api/lecturers/${lecturer.id}/portfolio-items/${coauthorId}/review`, rt,
      "POST", { action: "verified", note: "Coauthor verified" })).status).toBe(200);
    expect((await request(`/api/lecturers/annual/${yearId}/me/submit`, ct,
      "POST", { note: "Annual contributions submitted" })).status).toBe(204);

    const report = (await request(`/api/lecturers/annual/${yearId}/summary`, rt)).body as Report;
    expect(report.statistics.activeTeaching).toBe(1);
    expect(report.statistics.otherContributors).toBe(1);
    expect(report.statistics.distinctPublications).toBe(1);
    expect(report.statistics.verifiedCpdActivities).toBe(0);
    expect(report.staff.find(s => s.lecturerId === lecturer.id)?.submissionStatus).toBe("unreported");
    expect(report.staff.find(s => s.lecturerId === contributor.id)?.classification).toBe("other_contributor");

    const next = (await request(`/api/lecturers/annual/${nextYearId}/summary`, rt)).body as Report;
    expect(next.statistics.activeTeaching).toBe(0);

    const release = await request(`/api/lecturers/annual/${yearId}/release`, rt, "POST", {});
    expect(release.status).toBe(201);
    expect((release.body as Report).releaseVersion).toBe(1);
    const exportResult = await request(`/api/lecturers/annual/${yearId}/export`, rt);
    expect(exportResult.status).toBe(200);
    const files = exportResult.body as { version: number; csv: string; excelXml: string };
    expect(files.version).toBe(1);
    for (const id of [offeringId, pubId, coauthorId, "unreported"])
      expect(files.csv).toContain(id);
    expect(files.excelXml).toContain("<Workbook");

    const released = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM lecturer_annual."AnnualReportRelease"
      WHERE "academicYearId" = ${yearId} AND "version" = 1`;
    expect(released).toHaveLength(1);
    let rejected = false;
    try {
      await prisma.$executeRaw`
        UPDATE lecturer_annual."AnnualReportRelease"
        SET "version" = 99 WHERE "id" = ${released[0]!.id}`;
    } catch { rejected = true; }
    expect(rejected).toBe(true);
  });

  async function request(path: string, token: string, method = "GET", body?: unknown): Promise<HttpResponse> {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    return { status: response.status, body: raw ? JSON.parse(raw) : null };
  }
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email }, include: { roleAssignments: { include: { role: true } } },
  });
  return { id: user.id, email: user.email,
    roles: user.roleAssignments.map(a => a.role.slug as Role),
    programmeRoles: user.roleAssignments.map(a => ({
      role: a.role.slug as Role, programmeId: a.programmeId,
    })),
  };
}
