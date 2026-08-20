import { describe, expect, test } from "bun:test";
import { PublicCurriculumConflictError, PublicCurriculumNotFoundError } from "../../programme/public-curriculum-read-service.ts";
import { createAskDseService } from "./ask-dse-service.ts";

const provenance = {
  curriculumVersionId: "v1",
  curriculumVersion: "1.0",
  status: "Active" as const,
  sourceFileName: "curriculum.json",
  sourceSha256: "a".repeat(64),
};

const course = {
  code: "PAN202",
  title: "Predictive Analytics",
  yearLevel: 2,
  semester: "Second" as const,
  credits: 3,
  courseType: "Core",
  weeklyHoursTotal: 4,
  weeklyLectureHours: 2,
  weeklyLabHours: 2,
  weeklyFieldVisitHours: 0,
  lecturerText: "Mr. Chim Seyha",
  pathwayCode: null,
  conflicts: [],
  provenance,
};

const careerFaq = {
  slug: "careers-data-science",
  category: "Careers" as const,
  question: "What careers can DSE graduates pursue?",
  answer: "Graduates can work in data science and engineering roles.",
  shortAnswer: null,
  isFeatured: false,
  sourceLabel: "DSE",
  sourceUrl: "https://example.edu/dse/careers",
};

const programmingFaq = {
  slug: "programming-experience",
  category: "Admission" as const,
  question: "Do I need programming experience before joining?",
  answer: "Prior programming experience is helpful but not required.",
  shortAnswer: null,
  isFeatured: false,
  sourceLabel: "DSE",
  sourceUrl: null,
};

const scholarshipFaqs = [
  {
    slug: "scholarship-eligibility",
    category: "FeesScholarships" as const,
    question: "Who is eligible for DSE scholarships?",
    answer: "Published scholarship eligibility guidance.",
    shortAnswer: null,
    isFeatured: false,
    sourceLabel: "DSE",
    sourceUrl: null,
  },
  {
    slug: "scholarship-application",
    category: "FeesScholarships" as const,
    question: "How do I apply for a DSE scholarship?",
    answer: "Published scholarship application guidance.",
    shortAnswer: null,
    isFeatured: false,
    sourceLabel: "DSE",
    sourceUrl: null,
  },
];

function deps(options: { conflict?: boolean } = {}) {
  return {
    publicRead: {
      async getProgramme() {
        return {
          programmeName: "Data Science and Engineering",
          shortName: "DSE",
          overview: "Official overview",
          admissionEmail: "admission@example.edu",
          phone: "+855 00 000 000",
          websiteUrl: "https://example.edu/dse",
          facebookUrl: null,
          campusAddress: "Phnom Penh",
          mapUrl: null,
          applicationUrl: "https://example.edu/apply",
        };
      },
      async listFaqs() { return [careerFaq, programmingFaq]; },
      async getAdmission() {
        return {
          applicationUrl: "https://example.edu/apply",
          admissionEmail: "admission@example.edu",
          phone: "+855 00 000 000",
          faqs: [{
            slug: "admission-requirements",
            category: "Admission" as const,
            question: "What are the admission requirements?",
            answer: "Published admission requirements.",
            shortAnswer: null,
            isFeatured: true,
            sourceLabel: "DSE",
            sourceUrl: null,
          }, programmingFaq],
        };
      },
      async getFeesScholarships() { return { faqs: scholarshipFaqs }; },
      async listImportantDates() { return []; },
      async getContact() {
        return {
          admissionEmail: "admission@example.edu",
          phone: "+855 00 000 000",
          websiteUrl: "https://example.edu/dse",
          facebookUrl: null,
          campusAddress: "Phnom Penh",
          mapUrl: null,
          applicationUrl: "https://example.edu/apply",
        };
      },
    },
    publicCurriculumRead: {
      async listCourses() { return [course]; },
      async getCourse(_programmeId: string, query: string) {
        if (options.conflict) throw new PublicCurriculumConflictError("conflict");
        if (query.toLocaleUpperCase() !== "PAN202" && query.toLocaleLowerCase() !== "predictive analytics") {
          throw new PublicCurriculumNotFoundError("missing");
        }
        return course;
      },
      async getStudyPlan() {
        return {
          yearLevel: 2,
          semester: "Second" as const,
          courses: [course],
          totalCredits: 3,
          totalWeeklyHours: 4,
          provenance,
        };
      },
      async getTotals() {
        return {
          totalCourses: 1,
          totalCredits: 3,
          totalWeeklyHours: 4,
          byYearSemester: [{ yearLevel: 2, semester: "Second" as const, courseCount: 1, credits: 3, weeklyHours: 4 }],
          provenance,
        };
      },
    },
  };
}

describe("deterministic Ask DSE", () => {
  test("routes course-code questions to published curriculum lookup", async () => {
    const answer = await createAskDseService(deps()).answer("dse", "PAN202");
    expect(answer.intent).toBe("course");
    expect(answer.text).toContain("Predictive Analytics");
    expect(answer.provenance[0]).toContain("curriculum:v1@1.0");
  });

  test("routes year/semester questions to the study plan", async () => {
    const answer = await createAskDseService(deps()).answer("dse", "What do I study in year 2 semester 2?");
    expect(answer.intent).toBe("study-plan");
    expect(answer.text).toContain("Year 2 · Semester 2");
  });

  test("routes admission and contact questions without an LLM", async () => {
    const admission = await createAskDseService(deps()).answer("dse", "What are the admission requirements?");
    expect(admission.intent).toBe("admission");
    expect(admission.text).toContain("Published admission requirements");

    const contact = await createAskDseService(deps()).answer("dse", "What is the DSE contact email?");
    expect(contact.intent).toBe("contact");
    expect(contact.text).toContain("admission@example.edu");
  });

  test("returns the approved answer for an exact/strong FAQ match", async () => {
    const answer = await createAskDseService(deps()).answer("dse", "What careers can DSE graduates pursue?");
    expect(answer.intent).toBe("faq");
    expect(answer.matched).toBe(true);
    expect(answer.text).toContain("data science and engineering roles");
  });

  test("expands deterministic synonyms without generating a new claim", async () => {
    const answer = await createAskDseService(deps()).answer("dse", "need python before study?");
    expect(answer.intent).toBe("faq");
    expect(answer.text).toContain("programming experience");
    expect(answer.text).not.toContain("Python is required");
  });

  test("ambiguous scholarship query returns ranked published suggestions", async () => {
    const answer = await createAskDseService(deps()).answer("dse", "scholarship");
    expect(answer.intent).toBe("faq");
    expect(answer.matched).toBe(false);
    expect(answer.text).toContain("Who is eligible for DSE scholarships?");
    expect(answer.text).toContain("How do I apply for a DSE scholarship?");
  });

  test("returns safe unknown fallback rather than synthesizing facts", async () => {
    const answer = await createAskDseService(deps()).answer("dse", "Do students get free laptops?");
    expect(answer.intent).toBe("unknown");
    expect(answer.matched).toBe(false);
    expect(answer.text).toContain("couldn't match");
  });

  test("published curriculum conflicts fail closed", async () => {
    const answer = await createAskDseService(deps({ conflict: true })).answer("dse", "PAN202");
    expect(answer.intent).toBe("conflict");
    expect(answer.matched).toBe(false);
    expect(answer.text).toContain("won't guess");
  });
});
