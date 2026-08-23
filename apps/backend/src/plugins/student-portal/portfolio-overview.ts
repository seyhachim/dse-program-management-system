import type { StudentPortfolioOverview } from "@dse-pms/shared-types";
import { studentPortfolioProfileService } from "./portfolio-profile.ts";
import { studentPortfolioEvidenceService } from "./portfolio-evidence.ts";
import { studentPortfolioLinksService } from "./portfolio-links.ts";
import { studentPortfolioSoftSkillService } from "./portfolio-soft-skills.ts";
import { studentPortfolioCompetencyService } from "./portfolio-competencies.ts";

export const studentPortfolioOverviewService = {
  async get(userId: string): Promise<StudentPortfolioOverview> {
    const [profile, links, evidence, softSkills, competencies] = await Promise.all([
      studentPortfolioProfileService.get(userId),
      studentPortfolioLinksService.list(userId),
      studentPortfolioEvidenceService.list(userId),
      studentPortfolioSoftSkillService.list(userId),
      studentPortfolioCompetencyService.list(userId),
    ]);

    const checks = [
      { key: "Profile summary", done: Boolean(profile.headline && profile.bio) },
      { key: "Professional links", done: links.length >= 2 },
      { key: "Portfolio evidence", done: evidence.length >= 1 },
      { key: "Featured project", done: evidence.some((item) => item.featured) },
      { key: "Soft-skill evidence", done: softSkills.some((item) => item.evidenceCount > 0) },
      { key: "Programme competency evidence", done: competencies.some((item) => item.status !== "not_yet_evidenced") },
    ];
    const completed = checks.filter((item) => item.done).map((item) => item.key);
    const remaining = checks.filter((item) => !item.done).map((item) => item.key);

    return {
      profile,
      completion: {
        percentage: Math.round((completed.length / checks.length) * 100),
        completed,
        remaining,
      },
      links,
      featuredEvidence: evidence.filter((item) => item.featured),
      softSkills,
      competencies,
    };
  },
};
