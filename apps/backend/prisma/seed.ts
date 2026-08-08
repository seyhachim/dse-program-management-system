import { PrismaClient } from "@prisma/client";
import { PLOS, pluginManifests } from "@dse-pms/shared-types";
import { syncNormalizedRubricTables } from "../src/plugins/rubrics/service.ts";

/**
 * Seeds dev users (incl. several lecturers), students, courses, offerings and a
 * few enrollments so every plugin has data on first run. Idempotent via upsert.
 */
const prisma = new PrismaClient();

const users = [
  {
    email: "admin@dse.dev",
    name: "Admin User",
    role: "admin" as const,
  },
  {
    email: "coordinator@dse.dev",
    name: "Coordinator User",
    role: "program_coordinator" as const,
  },
  {
    email: "secretary@dse.dev",
    name: "Secretary User",
    role: "program_secretary" as const,
  },
  {
    email: "qa@dse.dev",
    name: "QA Reviewer User",
    role: "qa_reviewer" as const,
  },
  {
    email: "student@dse.dev",
    name: "Student User",
    role: "student" as const,
  },
  {
    email: "lecturer@dse.dev",
    name: "Rao",
    role: "lecturer" as const,
    title: "Dr.",
    qualification: "PhD in Computer Science",
    phone: "096 1000 001",
  },
  {
    email: "hopper.lecturer@dse.dev",
    name: "Hopper",
    role: "lecturer" as const,
    title: "Prof.",
    qualification: "PhD in Mathematics",
    phone: "096 1000 002",
  },
  {
    email: "knuth.lecturer@dse.dev",
    name: "Knuth",
    role: "lecturer" as const,
    title: "Prof.",
    qualification: "PhD in Computer Science",
    phone: "096 1000 003",
  },
];

const students = [
  {
    name: "Ada Lovelace",
    email: "ada@dse.dev",
    studentId: "DSE-0001",
    status: "Active" as const,
  },
  {
    name: "Alan Turing",
    email: "alan@dse.dev",
    studentId: "DSE-0002",
    status: "Active" as const,
  },
  {
    name: "Grace Hopper",
    email: "grace@dse.dev",
    studentId: "DSE-0003",
    status: "Pending" as const,
  },
  {
    name: "Katherine Johnson",
    email: "katherine@dse.dev",
    studentId: "DSE-0004",
    status: "Active" as const,
  },
  {
    name: "Edsger Dijkstra",
    email: "edsger@dse.dev",
    studentId: "DSE-0005",
    status: "Inactive" as const,
  },
];

const courses = [
  {
    code: "CS101",
    title: "Introduction to Programming",
    description: "Fundamentals of programming.",
    lecturer: "lecturer@dse.dev",
    credits: 3,
    prerequisites: null,
    courseType: "Basic" as const,
  },
  {
    code: "CS201",
    title: "Data Structures & Algorithms",
    description: "Core data structures.",
    lecturer: "knuth.lecturer@dse.dev",
    credits: 3,
    prerequisites: "CS101",
    courseType: "Core" as const,
  },
  {
    code: "CS301",
    title: "Databases",
    description: "Relational databases and SQL.",
    lecturer: "hopper.lecturer@dse.dev",
    credits: 3,
    prerequisites: "CS101; CS201",
    courseType: "Core" as const,
  },
];

const teachingMethods = [
  "Lecture",
  "Guided Hands-on Lab",
  "Demonstration",
  "Lab-based Learning",
  "Step-by-step Coding",
  "Scaffolded Exercises",
  "Tutoring",
  "Practice",
  "Case Study",
  "Seminar",
  "Team-based Learning",
  "Project-Based Learning",
  "Presentation",
  "Flipped Classroom",
  "Group Discussion",
];

const assessmentMethods = [
  "Assignment",
  "Mid-term Quiz",
  "Final Exam",
  "Quiz",
  "Lab Report",
  "Project",
  "Presentation & Defence",
  "Peer Review",
  "Reflection Journal",
];

/**
 * Programme-level graduate competencies.
 *
 * Step 2B.1a seeds the competency catalogue only.
 * Competency ↔ PLO mappings are intentionally not seeded here.
 * Those relationships will be managed separately at programme level.
 */
const programCompetencies = [
  {
    code: "PC1",
    name: "Python Programming for Data Science",
    order: 1,
  },
  {
    code: "PC2",
    name: "SQL and Database Management System",
    order: 2,
  },
  {
    code: "PC3",
    name: "Machine Learning Model Development",
    order: 3,
  },
  {
    code: "PC4",
    name: "Data Analysis and Visualization",
    order: 4,
  },
  {
    code: "PC5",
    name: "Big Data Technologies",
    order: 5,
  },
  {
    code: "PC6",
    name: "Data Engineering (ETL Pipelines, Data Warehousing)",
    order: 6,
  },
  {
    code: "PC7",
    name: "Data Application Development (Web, App)",
    order: 7,
  },
  {
    code: "PC8",
    name: "Mathematics for Data Science",
    order: 8,
  },
  {
    code: "PC9",
    name: "AI System and Applications Development",
    order: 9,
  },
  {
    code: "PC10",
    name: "Data Governance, Ethics, and Social Awareness",
    order: 10,
  },
  {
    code: "PC11",
    name: "Teamwork and Collaboration",
    order: 11,
  },
  {
    code: "PC12",
    name: "Leadership and Project Management",
    order: 12,
  },
  {
    code: "PC13",
    name: "Critical Thinking and Problem Solving",
    order: 13,
  },
  {
    code: "PC14",
    name: "Communication and Reporting",
    order: 14,
  },
  {
    code: "PC15",
    name: "Lifelong Learning and Self-Directed Learning",
    order: 15,
  },
  {
    code: "PC16",
    name: "Entrepreneurship and Innovation",
    order: 16,
  },
  {
    code: "PC17",
    name: "Systems Thinking and Sustainability",
    order: 17,
  },
  {
    code: "PC18",
    name: "Resilience and Adaptability",
    order: 18,
  },
];

/**
 * Role/Permission/RolePermission seed data (issue #65, phase 1). This is now
 * the enforced source of truth (issue #67 phase 2's cutover) — requirePermission()
 * reads the RolePermission cache these rows populate, not a hardcoded map.
 *
 * ROLE_PERMISSIONS_LEGACY in apps/backend/src/core/permissions/index.ts is a
 * frozen rollback reference for the pre-#67 world and is deliberately not kept
 * in sync with roleDefs beyond that point.
 *
 * The permission slugs themselves aren't hand-copied a third time:
 * they're derived from pluginManifests
 * (packages/shared-types/src/plugins.ts).
 */
const permissionTitles: Record<string, string> = {
  "accounts:create": "Create lecturer accounts",

  "students:read": "View students",
  "students:write": "Create/edit students",

  "courses:read": "View courses",
  "courses:write": "Edit a course's own specification",
  "courses:manage": "Create/edit/delete/reassign courses",
  "courses:review": "Review and approve course specifications",

  "offerings:read": "View offerings",
  "offerings:write": "Manage enrollment for an offering",
  "offerings:manage": "Create/edit/delete offerings",

  "lecturers:read": "View lecturers",
  "lecturers:write": "Edit lecturer profiles",

  "methods:read": "View teaching/assessment methods",
  "methods:write": "Add teaching/assessment methods",

  "rubrics:read": "View rubrics",
  "rubrics:write": "Create/edit rubrics",

  "programme:read": "View programme academic configuration",
  "programme:write": "Manage programme academic configuration",
};

const permissionSlugs = [
  ...new Set(pluginManifests.flatMap((m) => m.permissions ?? [])),
];

const roleDefs: {
  slug: string;
  title: string;
  description: string;
  permissions: string[];
}[] = [
  {
    slug: "admin",
    title: "Admin",
    description: "Full curriculum-admin access.",
    permissions: [
      "accounts:create",

      "students:read",
      "students:write",

      "courses:read",
      "courses:write",
      "courses:manage",
      "courses:review",

      "offerings:read",
      "offerings:write",
      "offerings:manage",

      "lecturers:read",
      "lecturers:write",

      "methods:read",
      "methods:write",

      "rubrics:read",
      "rubrics:write",

      "programme:read",
      "programme:write",
    ],
  },

  {
    slug: "program_coordinator",
    title: "Program Coordinator",

    // Programme academic management (issue #101 §5).
    // Full read/write across academic programme content.
    description:
      "Manages programme academic content: curriculum, courses, offerings, lecturer assignments.",

    permissions: [
      "students:read",

      "courses:read",
      "courses:write",
      "courses:manage",
      "courses:review",

      "offerings:read",
      "offerings:write",
      "offerings:manage",

      "lecturers:read",
      "lecturers:write",

      "methods:read",
      "methods:write",

      "rubrics:read",
      "rubrics:write",

      "programme:read",
      "programme:write",
    ],
  },

  {
    slug: "program_secretary",
    title: "Program Secretary",

    // Programme administrative support (issue #101 §6-8).
    // The secretary may read programme academic configuration but does not
    // receive programme:write because academic decisions stay with the
    // Program Coordinator/Admin.
    description:
      "Programme administrative and operational support — not academic decision authority.",

    permissions: [
      "students:read",
      "students:write",

      "courses:read",

      "offerings:read",
      "offerings:write",
      "offerings:manage",

      "lecturers:read",

      "methods:read",

      "rubrics:read",

      "programme:read",
    ],
  },

  {
    slug: "lecturer",
    title: "Lecturer",

    // Lecturers need programme:read because Course Specification will later
    // consume programme-level PLO and competency context.
    description:
      "Reads the catalog and fills in the specification of assigned courses/offerings.",

    permissions: [
      "students:read",

      "courses:read",
      "courses:write",

      "offerings:read",
      "offerings:write",

      "lecturers:read",

      "methods:read",
      "methods:write",

      "rubrics:read",
      "rubrics:write",

      "programme:read",
    ],
  },

  {
    slug: "qa_reviewer",
    title: "QA Reviewer",

    // QA requires read-only access to programme-level academic evidence.
    description:
      "Reviews programme evidence and findings for quality assurance. Read-only.",

    permissions: [
      "students:read",
      "courses:read",
      "offerings:read",
      "lecturers:read",
      "methods:read",
      "rubrics:read",

      "programme:read",
    ],
  },

  {
    slug: "student",
    title: "Student",
    description: "Read-only access to the catalog.",

    // No programme permissions yet. There is currently no student programme
    // management/portal workflow requiring this API.
    permissions: [
      "students:read",
      "courses:read",
      "offerings:read",
      "lecturers:read",
      "methods:read",
      "rubrics:read",
    ],
  },
];

// Standard 4-point rating scale shared by the sample rubrics.
const scale4 = [
  { label: "Excellent", points: 4 },
  { label: "Good", points: 3 },
  { label: "Fair", points: 2 },
  { label: "Poor", points: 1 },
];

/** A few sample rubrics for the Rubric Library, owned by the seed lecturer. */
const rubrics = [
  {
    name: "Assignment Rubric – Written Report",
    type: "Assignment",
    description:
      "Evaluates written assignments and reports based on content, analysis, organization and referencing.",
    status: "Active" as const,
    levels: scale4,
    criteria: [
      {
        id: "c1",
        name: "Content Quality",
        descriptors: [
          "Exceptional understanding and depth",
          "Good understanding with minor gaps",
          "Basic understanding with some gaps",
          "Limited understanding and depth",
        ],
      },
      {
        id: "c2",
        name: "Analysis & Critical Thinking",
        descriptors: [
          "Insightful analysis with strong evidence",
          "Good analysis with some evidence",
          "Limited analysis with weak evidence",
          "Minimal analysis with little evidence",
        ],
      },
      {
        id: "c3",
        name: "Organization & Structure",
        descriptors: [
          "Excellent flow and structure",
          "Well organized with minor issues",
          "Somewhat organized with issues",
          "Poorly organized and hard to follow",
        ],
      },
      {
        id: "c4",
        name: "Referencing",
        descriptors: [
          "Flawless, consistent citations",
          "Mostly correct citations",
          "Inconsistent citations",
          "Missing or incorrect citations",
        ],
      },
      {
        id: "c5",
        name: "Language & Clarity",
        descriptors: [
          "Clear, precise, error-free",
          "Clear with minor errors",
          "Understandable with several errors",
          "Unclear with frequent errors",
        ],
      },
    ],
  },

  {
    name: "Presentation Rubric",
    type: "Presentation",
    description:
      "Evaluates student presentations on delivery, content and visual aids.",
    status: "Active" as const,
    levels: scale4,
    criteria: [
      {
        id: "c1",
        name: "Delivery & Confidence",
        descriptors: [
          "Engaging and confident throughout",
          "Mostly confident delivery",
          "Hesitant in places",
          "Difficult to follow",
        ],
      },
      {
        id: "c2",
        name: "Content Mastery",
        descriptors: [
          "Complete command of the topic",
          "Good command with minor gaps",
          "Partial command",
          "Weak grasp of the topic",
        ],
      },
      {
        id: "c3",
        name: "Visual Aids",
        descriptors: [
          "Clear, effective, well-designed",
          "Helpful and readable",
          "Cluttered or sparse",
          "Distracting or absent",
        ],
      },
      {
        id: "c4",
        name: "Time Management",
        descriptors: [
          "Perfectly paced",
          "Slightly over/under time",
          "Noticeably off time",
          "Far outside the limit",
        ],
      },
    ],
  },

  {
    name: "Lab Report Rubric",
    type: "Lab",
    description:
      "Evaluates laboratory reports on method, results and interpretation.",
    status: "Active" as const,
    levels: scale4,
    criteria: [
      {
        id: "c1",
        name: "Methodology",
        descriptors: [
          "Rigorous and reproducible",
          "Sound with minor omissions",
          "Incomplete method",
          "Flawed or missing method",
        ],
      },
      {
        id: "c2",
        name: "Results & Data",
        descriptors: [
          "Accurate, well-presented data",
          "Mostly accurate data",
          "Some errors in data",
          "Inaccurate or missing data",
        ],
      },
      {
        id: "c3",
        name: "Interpretation",
        descriptors: [
          "Insightful, well-justified",
          "Reasonable conclusions",
          "Superficial interpretation",
          "Incorrect or absent",
        ],
      },
    ],
  },

  {
    name: "Quiz Rubric",
    type: "Quiz",
    description: "Scores short quizzes and quiz items.",
    status: "Draft" as const,
    levels: scale4,
    criteria: [
      {
        id: "c1",
        name: "Accuracy",
        descriptors: [
          "All answers correct",
          "Most answers correct",
          "About half correct",
          "Few answers correct",
        ],
      },
      {
        id: "c2",
        name: "Reasoning Shown",
        descriptors: [
          "Clear working throughout",
          "Working mostly shown",
          "Little working shown",
          "No working shown",
        ],
      },
    ],
  },
];

async function main() {
  // ---------------------------------------------------------------------------
  // Roles / Permissions
  // ---------------------------------------------------------------------------

  // Roles/permissions must exist before users are upserted below.
  for (const slug of permissionSlugs) {
    const title = permissionTitles[slug] ?? slug;

    await prisma.permission.upsert({
      where: { slug },
      update: { title },
      create: { slug, title },
    });
  }

  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { slug: r.slug },
      update: {
        title: r.title,
        description: r.description,
      },
      create: {
        slug: r.slug,
        title: r.title,
        description: r.description,
      },
    });

    for (const permSlug of r.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { slug: permSlug },
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }

    // Remove stale permission grants no longer listed for this role.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: {
          slug: {
            notIn: r.permissions,
          },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  for (const u of users) {
    const { role: roleSlug, ...userData } = u;

    const user = await prisma.user.upsert({
      where: {
        email: u.email,
      },
      update: userData,
      create: userData,
    });

    const role = await prisma.role.findUniqueOrThrow({
      where: {
        slug: roleSlug,
      },
    });

    await prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });

    // Remove stale role assignments. Seed users currently have one role.
    await prisma.userRoleAssignment.deleteMany({
      where: {
        userId: user.id,
        roleId: {
          not: role.id,
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Students
  // ---------------------------------------------------------------------------

  for (const s of students) {
    await prisma.student.upsert({
      where: {
        email: s.email,
      },
      update: s,
      create: s,
    });
  }

  // ---------------------------------------------------------------------------
  // Programme Learning Outcomes
  // ---------------------------------------------------------------------------

  /**
   * The existing shared PLOS constant remains the source of truth during
   * Step 2B.
   *
   * Existing CourseSpecClo.mappedPlos values continue storing stable codes
   * such as "PLO1" and "PLO2". These database rows deliberately use those
   * same codes, so no destructive CLO migration is required.
   */
  for (const [index, plo] of PLOS.entries()) {
    await prisma.programLearningOutcome.upsert({
      where: {
        code: plo.id,
      },
      update: {
        description: plo.description,
        order: index + 1,
        active: true,
      },
      create: {
        code: plo.id,
        description: plo.description,
        order: index + 1,
        active: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Programme Competencies
  // ---------------------------------------------------------------------------

  /**
   * Step 2B.1a creates the competency catalogue only.
   *
   * IMPORTANT:
   * No ProgramCompetencyPlo rows are created here.
   *
   * Competency ↔ PLO alignment is an academic relationship and will be
   * managed separately by authorized programme-level users.
   */
  for (const competency of programCompetencies) {
    await prisma.programCompetency.upsert({
      where: {
        code: competency.code,
      },
      update: {
        name: competency.name,
        order: competency.order,
        active: true,
      },
      create: {
        code: competency.code,
        name: competency.name,
        order: competency.order,
        active: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Teaching / Assessment Methods
  // ---------------------------------------------------------------------------

  for (const name of teachingMethods) {
    await prisma.teachingMethod.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of assessmentMethods) {
    await prisma.assessmentMethod.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // ---------------------------------------------------------------------------
  // Courses
  // ---------------------------------------------------------------------------

  for (const c of courses) {
    const lecturer = await prisma.user.findUnique({
      where: {
        email: c.lecturer,
      },
    });

    const courseData = {
      title: c.title,
      description: c.description,
      lecturerId: lecturer?.id ?? null,
      credits: c.credits,
      prerequisites: c.prerequisites,
      courseType: c.courseType,
    };

    await prisma.course.upsert({
      where: {
        code: c.code,
      },
      update: courseData,
      create: {
        code: c.code,
        ...courseData,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Rubrics
  // ---------------------------------------------------------------------------

  const rubricOwner = await prisma.user.findUnique({
    where: {
      email: "lecturer@dse.dev",
    },
  });

  for (const r of rubrics) {
    const { levels, criteria, ...rubricData } = r;

    const existing = await prisma.rubric.findFirst({
      where: {
        name: r.name,
        ownerId: rubricOwner?.id ?? null,
      },
    });

    const rubricId = existing
      ? (
          await prisma.rubric.update({
            where: {
              id: existing.id,
            },
            data: rubricData,
          })
        ).id
      : (
          await prisma.rubric.create({
            data: {
              ...rubricData,
              ownerId: rubricOwner?.id ?? null,
            },
          })
        ).id;

    await syncNormalizedRubricTables(prisma, rubricId, levels, criteria);
  }

  // ---------------------------------------------------------------------------
  // Sample Offering
  // ---------------------------------------------------------------------------

  // One offering: CS101 in 2025-Fall, taught by its course lecturer,
  // with two enrolled students.
  const cs101 = await prisma.course.findUnique({
    where: {
      code: "CS101",
    },
  });

  if (cs101) {
    const offering = await prisma.offering.upsert({
      where: {
        courseId_term: {
          courseId: cs101.id,
          term: "2025-Fall",
        },
      },
      update: {
        capacity: 30,
        status: "Active",
        lecturerId: cs101.lecturerId,
      },
      create: {
        courseId: cs101.id,
        term: "2025-Fall",
        capacity: 30,
        status: "Active",
        lecturerId: cs101.lecturerId,
      },
    });

    const enrolees = await prisma.student.findMany({
      where: {
        email: {
          in: ["ada@dse.dev", "alan@dse.dev"],
        },
      },
    });

    for (const s of enrolees) {
      await prisma.enrollment.upsert({
        where: {
          offeringId_studentId: {
            offeringId: offering.id,
            studentId: s.id,
          },
        },
        update: {},
        create: {
          offeringId: offering.id,
          studentId: s.id,
        },
      });
    }

    // A co-lecturer on the same offering.
    const coLecturer = await prisma.user.findUnique({
      where: {
        email: "hopper.lecturer@dse.dev",
      },
    });

    if (coLecturer) {
      await prisma.offeringCoLecturer.upsert({
        where: {
          offeringId_lecturerId: {
            offeringId: offering.id,
            lecturerId: coLecturer.id,
          },
        },
        update: {},
        create: {
          offeringId: offering.id,
          lecturerId: coLecturer.id,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${users.length} users, ` +
      `${students.length} students, ` +
      `${courses.length} courses, ` +
      `${teachingMethods.length} teaching + ` +
      `${assessmentMethods.length} assessment methods, ` +
      `${rubrics.length} rubrics, ` +
      `1 offering, ` +
      `${roleDefs.length} roles, ` +
      `${permissionSlugs.length} permissions, ` +
      `${PLOS.length} PLOs, ` +
      `${programCompetencies.length} programme competencies.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
