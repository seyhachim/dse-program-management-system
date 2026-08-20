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

const TOKEN_SYNONYMS: Record<string, string[]> = {
  python: ["programming", "coding", "experience"],
  code: ["coding", "programming"],
  coding: ["programming"],
  prereq: ["prerequisite", "requirement"],
  prerequisite: ["requirement"],
  scholarship: ["scholarships", "funding", "eligibility", "application", "deadline"],
  scholarships: ["scholarship", "funding", "eligibility", "application", "deadline"],
  fee: ["fees", "tuition", "cost"],
  fees: ["fee", "tuition", "cost"],
  job: ["jobs", "career", "careers"],
  jobs: ["job", "career", "careers"],
  work: ["career", "careers", "job"],
  apply: ["application", "admission"],
  deadline: ["date", "application"],
};

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function baseTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function queryTokens(value: string): string[] {
  const expanded = new Set<string>();
  for (const token of baseTokens(value)) {
    expanded.add(token);
    for (const synonym of TOKEN_SYNONYMS[token] ?? []) expanded.add(synonym);
  }
  return [...expanded];
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

function faqProvenance(faq: PublicProgrammeFaq): string[] {
  return faq.sourceUrl ? [`faq:${faq.slug}`, faq.sourceUrl] : [`faq:${faq.slug}`];
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

type RankedFaq = { faq: PublicProgrammeFaq; score: number };

function rankFaqs(question: string, faqs: PublicProgrammeFaq[]): RankedFaq[] {
  const query = queryTokens(question);
  if (!query.length) return [];
  const normalizedQuestion = normalize(question);
  return faqs
    .map((faq) => {
      const questionTokens = new Set(baseTokens(faq.question));
      const answerTokens = new Set(baseTokens(`${faq.shortAnswer ?? ""} ${faq.answer}`));
      let score = normalize(faq.question) === normalizedQuestion ? 10 : 0;
      for (const token of query) {
        if (questionTokens.has(token)) score += 1;
        else if (answerTokens.has(token)) score += 0.35;
      }
      score /= Math.max(1, query.length);
      if (faq.isFeatured) score += 0.03;
      return { faq, score };
    })
    .filter((item) => item.score >= 0.2)
    .sort((a, b) => b.score - a.score || a.faq.question.localeCompare(b.faq.question));
}

function directFaq(question: string, ranked: RankedFaq[]): PublicProgrammeFaq | null {
  if (!ranked.length) return null;
  const top = ranked[0]!;
  if (normalize(top.faq.question) === normalize(question)) return top.faq;
  const runnerUp = ranked[1]?.score ?? 0;
  if (top.score >= 0.72 && top.score - runnerUp >= 0.18) return top.faq;
  return null;
}

function faqSuggestions(ranked: RankedFaq[]): string | null {
  const suggestions = ranked.filter((item) => item.score >= 0.28).slice(0, 4);
  if (!suggestions.length) return null;
  return `I found a few published DSE topics that may match. Please choose the closest one:\n\n${suggestions.map((item) => `• ${item.faq.question}`).join("\n")}`;
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

function faqAnswer(question: string, faqs: PublicProgrammeFaq[]): AskDseAnswer | null {
  const ranked = rankFaqs(question, faqs);
  const direct = directFaq(question, ranked);
  if (direct) {
    return {
      intent: "faq",
      matched: true,
      text: `${direct.question}\n\n${direct.shortAnswer ?? direct.answer}`,
      provenance: faqProvenance(direct),
    };
  }
  const suggestions = faqSuggestions(ranked);
  if (suggestions) {
    return {
      intent: "faq",
      matched: false,
      text: suggestions,
      provenance: ranked.slice(0, 4).flatMap((item) => faqProvenance(item.faq)),
    };
  }
  return null;
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

        if (hasAny(clean, ["admission", "admissions", "apply", "application", "entrance exam"])) {
          const admission = await deps.publicRead.getAdmission(programmeId);
          const matchedFaq = faqAnswer(clean, admission.faqs);
          if (matchedFaq?.matched) return { ...matchedFaq, intent: "admission" };
          const details = [
            matchedFaq?.text ?? null,
            admission.applicationUrl && `Apply: ${admission.applicationUrl}`,
            admission.admissionEmail && `Email: ${admission.admissionEmail}`,
            admission.phone && `Phone: ${admission.phone}`,
          ].filter(Boolean);
          return {
            intent: "admission",
            matched: matchedFaq?.matched ?? true,
            text: `Admission\n\n${details.length ? details.join("\n\n") : "No published admission details are available yet."}`,
            provenance: matchedFaq?.provenance.length ? matchedFaq.provenance : ["programme-public-profile"],
          };
        }

        if (hasAny(clean, ["scholarship", "scholarships", "funding"])) {
          const data = await deps.publicRead.getFeesScholarships(programmeId);
          const answer = faqAnswer(clean, data.faqs);
          if (answer) return answer;
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

        const answer = faqAnswer(clean, await deps.publicRead.listFaqs(programmeId));
        if (answer) return answer;
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
