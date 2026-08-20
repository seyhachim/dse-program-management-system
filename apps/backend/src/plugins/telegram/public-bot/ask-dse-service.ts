import type {
  ProgrammeFaqCategory,
  PublicProgrammeAdmission,
  PublicProgrammeContact,
  PublicProgrammeFaq,
  PublicProgrammeFeesScholarships,
  PublicProgrammeImportantDate,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import {
  PublicCurriculumConflictError,
  PublicCurriculumNotFoundError,
  type PublicCurriculumCourse,
  type PublicCurriculumReadService,
  type PublicCurriculumStudyPlan,
  type PublicCurriculumTotals,
} from "../../programme/public-curriculum-read-service.ts";

export type AskDseIntent =
  | "overview"
  | "contact"
  | "admission"
  | "faq"
  | "course"
  | "study-plan"
  | "study-load"
  | "unknown"
  | "conflict";

export type AskDseAnswer = {
  intent: AskDseIntent;
  matched: boolean;
  text: string;
  provenance: string[];
};

type PublicReadService = {
  getProgramme(programmeId: string): Promise<PublicProgrammeProfile>;
  listFaqs(programmeId: string, filters?: { category?: ProgrammeFaqCategory; featured?: boolean }): Promise<PublicProgrammeFaq[]>;
  getAdmission(programmeId: string): Promise<PublicProgrammeAdmission>;
  getFeesScholarships(programmeId: string): Promise<PublicProgrammeFeesScholarships>;
  listImportantDates(programmeId: string): Promise<PublicProgrammeImportantDate[]>;
  getContact(programmeId: string): Promise<PublicProgrammeContact>;
};

export type AskDseDependencies = {
  publicRead: PublicReadService;
  publicCurriculumRead: PublicCurriculumReadService;
};

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "can", "dse", "do", "does", "for", "how",
  "i", "in", "is", "me", "of", "on", "please", "program", "programme", "tell", "the",
  "to", "what", "when", "where", "which", "who", "with", "you",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function hasAny(text: string, phrases: string[]): boolean {
  const normalized = normalize(text);
  return phrases.some((phrase) => normalized.includes(normalize(phrase)));
}

function sourceForCourse(course: PublicCurriculumCourse): string[] {
  const source = [`curriculum:${course.provenance.curriculumVersionId}@${course.provenance.curriculumVersion}`];
  if (course.provenance.sourceSha256) source.push(`sha256:${course.provenance.sourceSha256}`);
  return source;
}

function formatCourse(course: PublicCurriculumCourse): string {
  const hours = course.weeklyHoursTotal === null
    ? "Weekly hours are not available in the published curriculum source."
    : `Weekly hours: ${course.weeklyHoursTotal} (${course.weeklyLectureHours ?? 0} lecture + ${course.weeklyLabHours ?? 0} lab + ${course.weeklyFieldVisitHours ?? 0} field).`;
  return [
    `${course.code} · ${course.title}`,
    `Year ${course.yearLevel}, Semester ${course.semester === "First" ? 1 : 2}.`,
    `Credits: ${course.credits}. ${hours}`,
    course.lecturerText ? `Lecturer(s): ${course.lecturerText}.` : null,
    course.conflicts.length ? `⚠️ Published-source conflict: ${course.conflicts.join("; ")}` : null,
    `Source: approved curriculum v${course.provenance.curriculumVersion}.`,
  ].filter(Boolean).join("\n");
}

function formatStudyPlan(plan: PublicCurriculumStudyPlan): string {
  const rows = plan.courses.map((course) => {
    const hours = course.weeklyHoursTotal === null ? "hours n/a" : `${course.weeklyHoursTotal} h/wk`;
    return `• ${course.code} — ${course.title} · ${course.credits} cr · ${hours}`;
  });
  const totalHours = plan.totalWeeklyHours === null ? "weekly hours incomplete" : `${plan.totalWeeklyHours} h/week`;
  return `Year ${plan.yearLevel} · Semester ${plan.semester === "First" ? 1 : 2}\n\n${rows.join("\n")}\n\nTotal: ${plan.totalCredits} credits · ${totalHours}\nSource: approved curriculum v${plan.provenance.curriculumVersion}.`;
}

function formatTotals(totals: PublicCurriculumTotals): string {
  const rows = totals.byYearSemester.map((row) => {
    const hours = row.weeklyHours === null ? "hours n/a" : `${row.weeklyHours} h/wk`;
    return `• Year ${row.yearLevel} Sem ${row.semester === "First" ? 1 : 2}: ${row.credits} credits · ${hours}`;
  });
  return `DSE published curriculum study load\n\n${rows.join("\n")}\n\nDefault-route total: ${totals.totalCourses} courses · ${totals.totalCredits} credits.\nSource: approved curriculum v${totals.provenance.curriculumVersion}.`;
}

function parseStudyPlan(text: string): { year: number; semester: "First" | "Second" } | null {
  const normalized = normalize(text);
  const match = normalized.match(/\byear\s*([1-4])\b.*\bsemester\s*([12])\b/)
    ?? normalized.match(/\byear\s*([1-4])\b.*\b(first|second)\s+semester\b/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    semester: match[2] === "1" || match[2] === "first" ? "First" : "Second",
  };
}

function possibleCourseQuery(text: string): string | null {
  const trimmed = text.trim();
  if (/^[A-Z]{2,5}\d{3}$/i.test(trimmed)) return trimmed;
  const explicit = trimmed.match(/^(?:course|tell me about course|tell me about)\s+(.+)$/i)?.[1]?.trim();
  return explicit || null;
}

function faqScore(question: string, faq: PublicProgrammeFaq): number {
  const queryTokens = tokens(question);
  if (!queryTokens.length) return 0;
  const haystack = new Set(tokens(`${faq.question} ${faq.shortAnswer ?? ""} ${faq.answer}`));
  const overlap = queryTokens.filter((token) => haystack.has(token)).length;
  const exactQuestion = normalize(faq.question) === normalize(question) ? 10 : 0;
  return exactQuestion + overlap / queryTokens.length;
}

function bestFaq(question: string, faqs: PublicProgrammeFaq[]): PublicProgrammeFaq | null {
  const scored = faqs
    .map((faq) => ({ faq, score: faqScore(question, faq) }))
    .filter((item) => item.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.faq.question.localeCompare(b.faq.question));
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null;
  return scored[0]!.faq;
}

function contactText(contact: PublicProgrammeContact): string {
  const lines = [
    contact.campusAddress && `Location: ${contact.campusAddress}`,
    contact.phone && `Phone: ${contact.phone}`,
    contact.admissionEmail && `Email: ${contact.admissionEmail}`,
    contact.websiteUrl && `Website: ${contact.websiteUrl}`,
    contact.facebookUrl && `Facebook: ${contact.facebookUrl}`,
    contact.applicationUrl && `Apply: ${contact.applicationUrl}`,
  ].filter(Boolean);
  return lines.length ? `DSE contact information\n\n${lines.join("\n")}` : "No published contact information is available yet.";
}

export function createAskDseService(deps: AskDseDependencies) {
  return {
    async answer(programmeId: string, question: string): Promise<AskDseAnswer> {
      const clean = question.trim();
      if (!clean) {
        return {
          intent: "unknown",
          matched: false,
          text: "Ask a public DSE question, for example: “What do I study in Year 2 Semester 1?” or “Tell me about PAN202.”",
          provenance: [],
        };
      }

      try {
        const plan = parseStudyPlan(clean);
        if (plan) {
          const result = await deps.publicCurriculumRead.getStudyPlan(programmeId, plan.year, plan.semester);
          return {
            intent: "study-plan",
            matched: true,
            text: formatStudyPlan(result),
            provenance: [`curriculum:${result.provenance.curriculumVersionId}@${result.provenance.curriculumVersion}`],
          };
        }

        if (hasAny(clean, ["credit load", "total credits", "how many credits", "hours per week", "weekly hours", "study load"])) {
          const result = await deps.publicCurriculumRead.getTotals(programmeId);
          return {
            intent: "study-load",
            matched: true,
            text: formatTotals(result),
            provenance: [`curriculum:${result.provenance.curriculumVersionId}@${result.provenance.curriculumVersion}`],
          };
        }

        const courseQuery = possibleCourseQuery(clean);
        if (courseQuery) {
          try {
            const course = await deps.publicCurriculumRead.getCourse(programmeId, courseQuery);
            return { intent: "course", matched: true, text: formatCourse(course), provenance: sourceForCourse(course) };
          } catch (error) {
            if (error instanceof PublicCurriculumConflictError) throw error;
            if (!(error instanceof PublicCurriculumNotFoundError)) throw error;
          }
        }

        if (hasAny(clean, ["contact", "phone", "email", "location", "address", "website", "facebook"])) {
          return {
            intent: "contact",
            matched: true,
            text: contactText(await deps.publicRead.getContact(programmeId)),
            provenance: ["programme-public-profile"],
          };
        }

        if (hasAny(clean, ["admission", "admissions", "apply", "application", "eligibility", "requirement", "entrance exam"])) {
          const admission = await deps.publicRead.getAdmission(programmeId);
          const faq = bestFaq(clean, admission.faqs);
          const details = [
            faq ? `${faq.question}\n${faq.shortAnswer ?? faq.answer}` : null,
            admission.applicationUrl && `Apply: ${admission.applicationUrl}`,
            admission.admissionEmail && `Email: ${admission.admissionEmail}`,
            admission.phone && `Phone: ${admission.phone}`,
          ].filter(Boolean);
          return {
            intent: "admission",
            matched: true,
            text: `Admission\n\n${details.length ? details.join("\n\n") : "No published admission details are available yet."}`,
            provenance: faq?.sourceUrl ? [`faq:${faq.slug}`, faq.sourceUrl] : faq ? [`faq:${faq.slug}`] : ["programme-public-profile"],
          };
        }

        if (hasAny(clean, ["what is dse", "about dse", "programme overview", "program overview"])) {
          const profile = await deps.publicRead.getProgramme(programmeId);
          return {
            intent: "overview",
            matched: true,
            text: `${profile.programmeName}\n\n${profile.overview || "No published programme overview is available yet."}`,
            provenance: ["programme-public-profile"],
          };
        }

        const faqs = await deps.publicRead.listFaqs(programmeId);
        const faq = bestFaq(clean, faqs);
        if (faq) {
          return {
            intent: "faq",
            matched: true,
            text: `${faq.question}\n\n${faq.shortAnswer ?? faq.answer}`,
            provenance: faq.sourceUrl ? [`faq:${faq.slug}`, faq.sourceUrl] : [`faq:${faq.slug}`],
          };
        }
      } catch (error) {
        if (error instanceof PublicCurriculumConflictError) {
          return {
            intent: "conflict",
            matched: false,
            text: "I found conflicting published curriculum sources, so I won't guess. Please use the official DSE contact channel for confirmation.",
            provenance: [],
          };
        }
        throw error;
      }

      return {
        intent: "unknown",
        matched: false,
        text: "I couldn't match that question to confirmed published DSE information yet. Try a course code, a year and semester, admission, contact, credits, or choose a menu topic.",
        provenance: [],
      };
    },
  };
}

export type AskDseService = ReturnType<typeof createAskDseService>;
