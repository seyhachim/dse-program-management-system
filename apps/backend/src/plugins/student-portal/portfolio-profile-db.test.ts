import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";
import { studentPortfolioProfileService } from "./portfolio-profile.ts";

const dbDescribe = process.env.STUDENT_PORTFOLIO_DB_TESTS === "1" ? describe : describe.skip;

dbDescribe("student portfolio profile database boundary", () => {
  test("defaults private and updates only the authenticated student's profile", async () => {
    const suffix = randomUUID().slice(0, 8);
    const userA = await prisma.user.create({
      data: { email: `portfolio-a-${suffix}@example.edu`, name: "Portfolio Student A" },
    });
    const userB = await prisma.user.create({
      data: { email: `portfolio-b-${suffix}@example.edu`, name: "Portfolio Student B" },
    });

    try {
      const studentA = await prisma.student.create({
        data: {
          name: "Portfolio Student A",
          email: userA.email,
          studentId: `PORT-A-${suffix}`,
          status: "Active",
          userId: userA.id,
        },
      });
      const studentB = await prisma.student.create({
        data: {
          name: "Portfolio Student B",
          email: userB.email,
          studentId: `PORT-B-${suffix}`,
          status: "Active",
          userId: userB.id,
        },
      });

      const initial = await studentPortfolioProfileService.get(userA.id);
      expect(initial.identity.studentRecordId).toBe(studentA.id);
      expect(initial.visibility).toBe("private");
      expect(initial.publicSlug).toBeNull();
      expect(initial.createdAt).toBeNull();

      const updated = await studentPortfolioProfileService.update(userA.id, {
        headline: "Data Science Student",
        bio: "Building evidence-backed portfolio work.",
        careerInterests: ["Machine Learning"],
        visibility: "private",
        publicSlug: null,
      });
      expect(updated.identity.studentRecordId).toBe(studentA.id);
      expect(updated.headline).toBe("Data Science Student");

      const profileA = await prisma.studentPortfolioProfile.findUnique({ where: { studentId: studentA.id } });
      const profileB = await prisma.studentPortfolioProfile.findUnique({ where: { studentId: studentB.id } });
      expect(profileA?.headline).toBe("Data Science Student");
      expect(profileA?.isPublic).toBe(false);
      expect(profileB).toBeNull();
    } finally {
      await prisma.student.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    }
  });
});
