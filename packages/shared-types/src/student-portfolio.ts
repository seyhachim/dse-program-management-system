import { z } from "zod";

export const StudentPortfolioVisibility = z.enum(["private", "public"]);
export type StudentPortfolioVisibility = z.infer<typeof StudentPortfolioVisibility>;

const PortfolioSlug = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens only");

export const StudentPortfolioProfileInput = z
  .object({
    headline: z.string().trim().max(120).default(""),
    bio: z.string().trim().max(1000).default(""),
    careerInterests: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .default([])
      .transform((items) => [...new Set(items)]),
    visibility: StudentPortfolioVisibility.default("private"),
    publicSlug: PortfolioSlug.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.visibility === "public" && !value.publicSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicSlug"],
        message: "A public slug is required before a portfolio can be marked public",
      });
    }
  });
export type StudentPortfolioProfileInput = z.infer<typeof StudentPortfolioProfileInput>;

export interface StudentPortfolioIdentity {
  studentRecordId: string;
  studentId: string;
  name: string;
  email: string;
}

export interface StudentPortfolioProfile {
  identity: StudentPortfolioIdentity;
  headline: string;
  bio: string;
  careerInterests: string[];
  visibility: StudentPortfolioVisibility;
  publicSlug: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
