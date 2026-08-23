import type {
  StudentPortfolioProfile,
  StudentPortfolioProfileInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalConflictError } from "./service.ts";

type PortfolioStudentRow = {
  id: string;
  name: string;
  studentId: string;
  email: string | null;
  status: string;
  portfolioProfile: {
    headline: string;
    bio: string;
    careerInterests: string[];
    isPublic: boolean;
    publicSlug: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

export function requirePortfolioStudent(row: PortfolioStudentRow | null): asserts row is PortfolioStudentRow & { email: string } {
  if (!row || row.status !== "Active") {
    throw new PortalAccessError("No active student profile is linked to this account");
  }
  if (!row.email) {
    throw new PortalAccessError("The linked student portal profile has no official email");
  }
}

function toProfile(row: PortfolioStudentRow & { email: string }): StudentPortfolioProfile {
  const profile = row.portfolioProfile;
  return {
    identity: {
      studentRecordId: row.id,
      studentId: row.studentId,
      name: row.name,
      email: row.email,
    },
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    careerInterests: profile?.careerInterests ?? [],
    visibility: profile?.isPublic ? "public" : "private",
    publicSlug: profile?.publicSlug ?? null,
    createdAt: profile?.createdAt.toISOString() ?? null,
    updatedAt: profile?.updatedAt.toISOString() ?? null,
  };
}

async function studentForPortfolio(userId: string): Promise<PortfolioStudentRow & { email: string }> {
  const row = await prisma.student.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      studentId: true,
      email: true,
      status: true,
      portfolioProfile: {
        select: {
          headline: true,
          bio: true,
          careerInterests: true,
          isPublic: true,
          publicSlug: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  requirePortfolioStudent(row);
  return row;
}

export const studentPortfolioProfileService = {
  async get(userId: string): Promise<StudentPortfolioProfile> {
    return toProfile(await studentForPortfolio(userId));
  },

  async update(userId: string, input: StudentPortfolioProfileInput): Promise<StudentPortfolioProfile> {
    const student = await studentForPortfolio(userId);
    try {
      const portfolioProfile = await prisma.studentPortfolioProfile.upsert({
        where: { studentId: student.id },
        create: {
          studentId: student.id,
          headline: input.headline,
          bio: input.bio,
          careerInterests: input.careerInterests,
          isPublic: input.visibility === "public",
          publicSlug: input.publicSlug,
        },
        update: {
          headline: input.headline,
          bio: input.bio,
          careerInterests: input.careerInterests,
          isPublic: input.visibility === "public",
          publicSlug: input.publicSlug,
        },
        select: {
          headline: true,
          bio: true,
          careerInterests: true,
          isPublic: true,
          publicSlug: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return toProfile({ ...student, portfolioProfile });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new PortalConflictError("That public portfolio URL is already in use");
      }
      throw error;
    }
  },
};

export type StudentPortfolioProfileService = typeof studentPortfolioProfileService;
