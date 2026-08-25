import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COURSE_REPAIRS = [
  {
    "code": "CRY402",
    "importedTitle": "Introduction to Cryptography",
    "importedCredits": 3.0,
    "canonicalTitle": "Cryptography",
    "canonicalCredits": 3.0
  },
  {
    "code": "DEC401",
    "importedTitle": "Data Engineering and Cloud Technologies",
    "importedCredits": 3.0,
    "canonicalTitle": "Data Engineering and Cloud Technologies",
    "canonicalCredits": 3.0
  },
  {
    "code": "DMI301",
    "importedTitle": "Data Mining",
    "importedCredits": 3.0,
    "canonicalTitle": "Data Mining",
    "canonicalCredits": 3.0
  },
  {
    "code": "DSA201",
    "importedTitle": "Data Structure and Algorithm I",
    "importedCredits": 3.0,
    "canonicalTitle": "Data Structures and Algorithms I",
    "canonicalCredits": 3.0
  },
  {
    "code": "DSA202",
    "importedTitle": "Data Structure and Algorithm I",
    "importedCredits": 3.0,
    "canonicalTitle": "Data Structures and Algorithms II",
    "canonicalCredits": 3.0
  },
  {
    "code": "ENG101",
    "importedTitle": "English I: Academic Reading for Data Science",
    "importedCredits": 4.0,
    "canonicalTitle": "English I: Academic Reading for Data Science",
    "canonicalCredits": 4.0
  },
  {
    "code": "ENG102",
    "importedTitle": "English II: Communication and Academic Writing for Data Science",
    "importedCredits": 4.0,
    "canonicalTitle": "English II: Communication and Academic Writing for Data Science",
    "canonicalCredits": 3.0
  },
  {
    "code": "ERD401",
    "importedTitle": "Ethics and Responsible Data Science",
    "importedCredits": 3.0,
    "canonicalTitle": "Ethics and Responsible Data Science",
    "canonicalCredits": 3.0
  },
  {
    "code": "FTE402",
    "importedTitle": "Financial Technology",
    "importedCredits": 3.0,
    "canonicalTitle": "Financial Technology",
    "canonicalCredits": 3.0
  },
  {
    "code": "IDS101",
    "importedTitle": "Introduction to Data Science and Engineering",
    "importedCredits": 3.0,
    "canonicalTitle": "Introduction to Data Science and Engineering",
    "canonicalCredits": 3.0
  },
  {
    "code": "MAD302",
    "importedTitle": "Mobile App Development for Data Science (Android & ML Integration)",
    "importedCredits": 3.0,
    "canonicalTitle": "Mobile App Development for Data Science (Android & ML Integration)",
    "canonicalCredits": 3.0
  },
  {
    "code": "MAT101",
    "importedTitle": "Math I-Calculus",
    "importedCredits": 4.0,
    "canonicalTitle": "Math II: Linear Algebra",
    "canonicalCredits": 4.0
  },
  {
    "code": "MAT102",
    "importedTitle": "Math II-Linear Algebra",
    "importedCredits": 4.0,
    "canonicalTitle": "Math I: Calculus",
    "canonicalCredits": 4.0
  },
  {
    "code": "NDA202",
    "importedTitle": "NoSQL Database",
    "importedCredits": 3.0,
    "canonicalTitle": "NoSQL Databases (Graph and Document)",
    "canonicalCredits": 3.0
  },
  {
    "code": "NLP401",
    "importedTitle": "Natural Language Processing (NLP)",
    "importedCredits": 3.0,
    "canonicalTitle": "Natural Language Processing",
    "canonicalCredits": 3.0
  },
  {
    "code": "PPR201",
    "importedTitle": "Project Practicum I: Software Engineering",
    "importedCredits": 2.0,
    "canonicalTitle": "Project Practicum I: Web Engineering Fundamentals",
    "canonicalCredits": 2.0
  },
  {
    "code": "PPR202",
    "importedTitle": "Project Practicum II: Software Engineering",
    "importedCredits": 2.0,
    "canonicalTitle": "Project Practicum II: Applied Web Engineering",
    "canonicalCredits": 2.0
  },
  {
    "code": "PPR301",
    "importedTitle": "Project Practicum I: Data Analytics & Machine Learning",
    "importedCredits": 2.0,
    "canonicalTitle": "Project Practicum I: Applied Machine Learning",
    "canonicalCredits": 2.0
  },
  {
    "code": "PPR302",
    "importedTitle": "Project Practicum II: Data Analytics & Machine Learning",
    "importedCredits": 2.0,
    "canonicalTitle": "Project Practicum II: Applied Machine Learning",
    "canonicalCredits": 2.0
  },
  {
    "code": "RDM201",
    "importedTitle": "Relational Database Modeling and SQL",
    "importedCredits": 3.0,
    "canonicalTitle": "Relational Database Modeling and SQL",
    "canonicalCredits": 3.0
  },
  {
    "code": "TSA301",
    "importedTitle": "Time Series Analysis",
    "importedCredits": 3.0,
    "canonicalTitle": "Time Series Analysis",
    "canonicalCredits": 3.0
  },
  {
    "code": "WAD301",
    "importedTitle": "Web App Development for Data Science (with Streamlit & FastAPI/Flask)",
    "importedCredits": 3.0,
    "canonicalTitle": "Web App Development for Data Science (with Streamlit & FastAPI/Flask)",
    "canonicalCredits": 3.0
  }
] as const;

function sameNumber(a: number | null, b: number | null): boolean {
  return a === b;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const results: Array<Record<string, unknown>> = [];

  for (const expected of COURSE_REPAIRS) {
    const course = await prisma.course.findUnique({
      where: { code: expected.code },
      select: {
        id: true,
        code: true,
        title: true,
        credits: true,
        description: true,
        prerequisites: true,
        courseType: true,
        totalSltHours: true,
        lecturerId: true,
      },
    });

    if (!course) {
      results.push({ code: expected.code, action: "missing" });
      continue;
    }

    const titleIsKnown =
      course.title === expected.importedTitle ||
      course.title === expected.canonicalTitle;
    const creditsIsKnown =
      sameNumber(course.credits, expected.importedCredits) ||
      sameNumber(course.credits, expected.canonicalCredits);

    if (!titleIsKnown || !creditsIsKnown) {
      results.push({
        code: expected.code,
        action: "conflict",
        currentTitle: course.title,
        currentCredits: course.credits,
        expectedImportedTitle: expected.importedTitle,
        expectedImportedCredits: expected.importedCredits,
        canonicalTitle: expected.canonicalTitle,
        canonicalCredits: expected.canonicalCredits,
      });
      continue;
    }

    const needsRepair =
      course.title !== expected.canonicalTitle ||
      !sameNumber(course.credits, expected.canonicalCredits);

    if (commit && needsRepair) {
      await prisma.course.update({
        where: { id: course.id },
        data: {
          title: expected.canonicalTitle,
          credits: expected.canonicalCredits,
        },
      });
    }

    results.push({
      code: expected.code,
      action: needsRepair ? (commit ? "repaired" : "would-repair") : "already-canonical",
      from: { title: course.title, credits: course.credits },
      to: { title: expected.canonicalTitle, credits: expected.canonicalCredits },
      auditOnlyFields: {
        description: course.description,
        prerequisites: course.prerequisites,
        courseType: course.courseType,
        totalSltHours: course.totalSltHours,
        lecturerId: course.lecturerId,
      },
    });
  }

  const summary = {
    mode: commit ? "commit" : "dry-run",
    total: results.length,
    wouldRepair: results.filter((r) => r.action === "would-repair").length,
    repaired: results.filter((r) => r.action === "repaired").length,
    alreadyCanonical: results.filter((r) => r.action === "already-canonical").length,
    conflicts: results.filter((r) => r.action === "conflict").length,
    missing: results.filter((r) => r.action === "missing").length,
  };

  console.log(JSON.stringify({
    summary,
    note:
      "This repair only restores title and credits because those fields are explicitly supported by DSE Curriculum - 2026.docx. It intentionally does not guess previous description, prerequisites, courseType, totalSltHours, or lecturerId.",
    results,
  }, null, 2));

  if (summary.conflicts > 0 || summary.missing > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
