import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../../apps/backend/src/core/db/prisma.ts";
import { newRoleContext } from "./auth.ts";

const ENDPOINT = "http://127.0.0.1:4000/api/student-portal/portfolio/directory";

test.describe("#1321 DSE Student Projects Directory staging smoke", () => {
  test("shows only consented projects, rejects cross-role reads and updates after unpublish on mobile and desktop", async ({ browser, request }) => {
    // Synthetic records are created ONLY in the isolated CI browser database.
    // Never run this suite against a connected staging/production database.
    if (process.env.CI !== "true" || process.env.AUTH_MODE !== "dev"
        || !process.env.DATABASE_URL?.includes("/dse_browser")) {
      test.skip(true, "Requires CI's isolated dse_browser PostgreSQL and dev JWT setup");
    }

    const suffix = randomUUID().slice(0, 12);
    const projectTitle = `Chili harvest modelling ${suffix}`;
    const hiddenTitle = `Private student working draft ${suffix}`;
    const email = `directory-smoke-${suffix}@dse.invalid`;
    const cohortCode = `PD-${suffix}`;
    const slug = `student-projects-${suffix}`;
    let userId: string | undefined;
    let studentId: string | undefined;
    let cohortId: string | undefined;

    const coordinator = await newRoleContext(browser, "coordinator");
    try {
      const user = await prisma.user.create({ data: { name: "Portfolio Directory Test Student", email } });
      userId = user.id;
      const student = await prisma.student.create({
        data: { name: "Portfolio Directory Test Student", email, userId: user.id, status: "Active" },
      });
      studentId = student.id;
      const cohort = await prisma.studentCohort.create({
        data: {
          programmeId: "dse", code: cohortCode,
          name: `Directory synthetic cohort ${suffix}`,
          intakeYear: 2026, expectedGraduationYear: 2030,
        },
      });
      cohortId = cohort.id;
      await prisma.studentCohortMembership.create({
        data: { cohortId: cohort.id, studentId: student.id, joinedAt: new Date("2026-09-01T00:00:00.000Z") },
      });
      await prisma.studentPortfolioProfile.create({
        data: { studentId: student.id, headline: "Synthetic student project", isPublic: true, publicSlug: slug },
      });
      await prisma.studentPortfolioEvidence.createMany({
        data: [
          {
            studentId: student.id, origin: "ExternalProject", title: projectTitle,
            summary: "A synthetic demo project for privacy and search tests.",
            skills: ["Python", "Machine Learning"], isPublic: true, isFeatured: true,
          },
          {
            studentId: student.id, origin: "ExternalProject", title: hiddenTitle,
            summary: "This unpublished item must never be visible to staff search.",
            skills: ["PrivateTag"], isPublic: false, isFeatured: false,
          },
        ],
      });

      const coordinatorToken = process.env.BROWSER_SMOKE_COORDINATOR_TOKEN!;
      const lecturerToken = process.env.BROWSER_SMOKE_LECTURER_TOKEN!;
      const auth = { Authorization: `Bearer ${coordinatorToken}` };
      const unauthorized = await request.get(ENDPOINT);
      expect(unauthorized.status()).toBe(401);
      const lecturer = await request.get(ENDPOINT, {
        headers: { Authorization: `Bearer ${lecturerToken}` },
      });
      expect(lecturer.status()).toBe(403);
      const wrongProgramme = await request.get(`${ENDPOINT}?programmeId=unrelated`, {
        headers: auth,
      });
      expect(wrongProgramme.status()).toBe(403);

      const apiResult = await request.get(`${ENDPOINT}?q=${encodeURIComponent(suffix)}`, { headers: auth });
      expect(apiResult.status()).toBe(200);
      expect(apiResult.headers()["cache-control"]).toContain("no-store");
      const payload = await apiResult.json() as { total: number; items: Array<{ title: string; studentName: string }> };
      expect(payload.total).toBe(1);
      expect(payload.items.map((item) => item.title)).toEqual([projectTitle]);
      const responseBody = JSON.stringify(payload);
      expect(responseBody).not.toContain(hiddenTitle);
      expect(responseBody).not.toContain(email);
      expect(responseBody).not.toContain(student.id);

      const page = await coordinator.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/student-projects");
      await expect(page.getByRole("heading", { name: "Student Projects", exact: true })).toBeVisible();
      await page.getByRole("textbox", { name: "Search" }).fill(suffix);
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
      await expect(page.getByText(hiddenTitle)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Open published portfolio" })).toHaveAttribute(
        "href", `/portfolio/${slug}`,
      );

      // Mobile is the actual client UI, not a headless API-only test.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

      await page.getByRole("textbox", { name: "Search" }).fill(hiddenTitle);
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect(page.getByText("No matching projects")).toBeVisible();

      // The next API read must reflect withdrawal without a stale cache.
      await prisma.studentPortfolioProfile.update({
        where: { studentId: student.id }, data: { isPublic: false },
      });
      const afterUnpublish = await request.get(`${ENDPOINT}?q=${encodeURIComponent(suffix)}`, { headers: auth });
      expect(afterUnpublish.status()).toBe(200);
      expect((await afterUnpublish.json() as { total: number }).total).toBe(0);
    } finally {
      await coordinator.close();
      // No audit or academic sources are changed. Only synthetic test records
      // inserted above are removed, even if a browser/API assertion fails.
      if (studentId) {
        await prisma.studentPortfolioEvidence.deleteMany({ where: { studentId } });
        await prisma.studentPortfolioProfile.deleteMany({ where: { studentId } });
        await prisma.studentCohortMembership.deleteMany({ where: { studentId } });
        await prisma.student.delete({ where: { id: studentId } });
      }
      if (cohortId) await prisma.studentCohort.delete({ where: { id: cohortId } });
      if (userId) await prisma.user.delete({ where: { id: userId } });
    }
  });
});
