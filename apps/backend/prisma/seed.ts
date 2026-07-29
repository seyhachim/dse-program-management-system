import { PrismaClient } from "@prisma/client";
import { pluginManifests } from "@dse-pms/shared-types";

/**
 * Seeds dev users (incl. several lecturers), students, courses, offerings and a
 * few enrollments so every plugin has data on first run. Idempotent via upsert.
 */
const prisma = new PrismaClient();

const users = [
  { email: "admin@dse.dev", name: "Admin User", role: "admin" as const },
  { email: "student@dse.dev", name: "Student User", role: "student" as const },
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
  { name: "Ada Lovelace", email: "ada@dse.dev", studentId: "DSE-0001", status: "Active" as const },
  { name: "Alan Turing", email: "alan@dse.dev", studentId: "DSE-0002", status: "Active" as const },
  { name: "Grace Hopper", email: "grace@dse.dev", studentId: "DSE-0003", status: "Pending" as const },
  { name: "Katherine Johnson", email: "katherine@dse.dev", studentId: "DSE-0004", status: "Active" as const },
  { name: "Edsger Dijkstra", email: "edsger@dse.dev", studentId: "DSE-0005", status: "Inactive" as const },
];

const courses = [
  { code: "CS101", title: "Introduction to Programming", description: "Fundamentals of programming.", lecturer: "lecturer@dse.dev", credits: 3, prerequisites: null, courseType: "Basic" as const },
  { code: "CS201", title: "Data Structures & Algorithms", description: "Core data structures.", lecturer: "knuth.lecturer@dse.dev", credits: 3, prerequisites: "CS101", courseType: "Core" as const },
  { code: "CS301", title: "Databases", description: "Relational databases and SQL.", lecturer: "hopper.lecturer@dse.dev", credits: 3, prerequisites: "CS101; CS201", courseType: "Core" as const },
];

const teachingMethods = [
  "Lecture", "Guided Hands-on Lab", "Demonstration", "Lab-based Learning",
  "Step-by-step Coding", "Scaffolded Exercises", "Tutoring", "Practice",
  "Case Study", "Seminar", "Team-based Learning", "Project-Based Learning",
  "Presentation", "Flipped Classroom", "Group Discussion",
];

const assessmentMethods = [
  "Assignment", "Mid-term Quiz", "Final Exam", "Quiz", "Lab Report",
  "Project", "Presentation & Defence", "Peer Review", "Reflection Journal",
];

/**
 * Role/Permission/RolePermission seed data (issue #65, phase 1). Mirrors
 * ROLE_PERMISSIONS in apps/backend/src/core/permissions/index.ts exactly, so the
 * DB documents today's authorization behavior even though nothing reads from it
 * yet — requirePermission() still checks that hardcoded map. Keep roleDefs in
 * sync with it until the follow-up that makes this the enforced source of truth.
 *
 * The permission *slugs* themselves aren't hand-copied a third time, though:
 * they're derived from pluginManifests (packages/shared-types/src/plugins.ts),
 * per CLAUDE.md's "shared-types is the single source of truth ... for ...
 * permission strings" — this map only supplies a human-readable title per slug.
 */
const permissionTitles: Record<string, string> = {
  "accounts:create": "Create lecturer accounts",
  "students:read": "View students",
  "students:write": "Create/edit students",
  "courses:read": "View courses",
  "courses:write": "Edit a course's own specification",
  "courses:manage": "Create/edit/delete/reassign courses",
  "offerings:read": "View offerings",
  "offerings:write": "Manage enrollment for an offering",
  "offerings:manage": "Create/edit/delete offerings",
  "lecturers:read": "View lecturers",
  "lecturers:write": "Edit lecturer profiles",
  "methods:read": "View teaching/assessment methods",
  "methods:write": "Add teaching/assessment methods",
  "rubrics:read": "View rubrics",
  "rubrics:write": "Create/edit rubrics",
};

const permissionSlugs = [...new Set(pluginManifests.flatMap((m) => m.permissions ?? []))];

const roleDefs: { slug: string; title: string; description: string; permissions: string[] }[] = [
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
      "offerings:read",
      "offerings:write",
      "offerings:manage",
      "lecturers:read",
      "lecturers:write",
      "methods:read",
      "methods:write",
      "rubrics:read",
      "rubrics:write",
    ],
  },
  {
    slug: "lecturer",
    title: "Lecturer",
    description: "Reads the catalog and fills in the specification of assigned courses/offerings.",
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
    ],
  },
  {
    slug: "student",
    title: "Student",
    description: "Read-only access to the catalog.",
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
    description: "Evaluates written assignments and reports based on content, analysis, organization and referencing.",
    status: "Active" as const,
    levels: scale4,
    criteria: [
      { id: "c1", name: "Content Quality", descriptors: ["Exceptional understanding and depth", "Good understanding with minor gaps", "Basic understanding with some gaps", "Limited understanding and depth"] },
      { id: "c2", name: "Analysis & Critical Thinking", descriptors: ["Insightful analysis with strong evidence", "Good analysis with some evidence", "Limited analysis with weak evidence", "Minimal analysis with little evidence"] },
      { id: "c3", name: "Organization & Structure", descriptors: ["Excellent flow and structure", "Well organized with minor issues", "Somewhat organized with issues", "Poorly organized and hard to follow"] },
      { id: "c4", name: "Referencing", descriptors: ["Flawless, consistent citations", "Mostly correct citations", "Inconsistent citations", "Missing or incorrect citations"] },
      { id: "c5", name: "Language & Clarity", descriptors: ["Clear, precise, error-free", "Clear with minor errors", "Understandable with several errors", "Unclear with frequent errors"] },
    ],
  },
  {
    name: "Presentation Rubric",
    type: "Presentation",
    description: "Evaluates student presentations on delivery, content and visual aids.",
    status: "Active" as const,
    levels: scale4,
    criteria: [
      { id: "c1", name: "Delivery & Confidence", descriptors: ["Engaging and confident throughout", "Mostly confident delivery", "Hesitant in places", "Difficult to follow"] },
      { id: "c2", name: "Content Mastery", descriptors: ["Complete command of the topic", "Good command with minor gaps", "Partial command", "Weak grasp of the topic"] },
      { id: "c3", name: "Visual Aids", descriptors: ["Clear, effective, well-designed", "Helpful and readable", "Cluttered or sparse", "Distracting or absent"] },
      { id: "c4", name: "Time Management", descriptors: ["Perfectly paced", "Slightly over/under time", "Noticeably off time", "Far outside the limit"] },
    ],
  },
  {
    name: "Lab Report Rubric",
    type: "Lab",
    description: "Evaluates laboratory reports on method, results and interpretation.",
    status: "Active" as const,
    levels: scale4,
    criteria: [
      { id: "c1", name: "Methodology", descriptors: ["Rigorous and reproducible", "Sound with minor omissions", "Incomplete method", "Flawed or missing method"] },
      { id: "c2", name: "Results & Data", descriptors: ["Accurate, well-presented data", "Mostly accurate data", "Some errors in data", "Inaccurate or missing data"] },
      { id: "c3", name: "Interpretation", descriptors: ["Insightful, well-justified", "Reasonable conclusions", "Superficial interpretation", "Incorrect or absent"] },
    ],
  },
  {
    name: "Quiz Rubric",
    type: "Quiz",
    description: "Scores short quizzes and quiz items.",
    status: "Draft" as const,
    levels: scale4,
    criteria: [
      { id: "c1", name: "Accuracy", descriptors: ["All answers correct", "Most answers correct", "About half correct", "Few answers correct"] },
      { id: "c2", name: "Reasoning Shown", descriptors: ["Clear working throughout", "Working mostly shown", "Little working shown", "No working shown"] },
    ],
  },
];

async function main() {
  // Roles/permissions must exist before users are upserted below — User.roleId
  // (issue #67) is a required FK connected by role slug.
  for (const slug of permissionSlugs) {
    const title = permissionTitles[slug] ?? slug;
    await prisma.permission.upsert({ where: { slug }, update: { title }, create: { slug, title } });
  }
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { slug: r.slug },
      update: { title: r.title, description: r.description },
      create: { slug: r.slug, title: r.title, description: r.description },
    });
    for (const permSlug of r.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { slug: permSlug } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    // Revoke any grant this role held previously but no longer lists — otherwise
    // a permission removed from roleDefs (mirroring a ROLE_PERMISSIONS edit, e.g.
    // commit 0c6ae0d's lecturer least-privilege fix) would stay granted forever.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { slug: { notIn: r.permissions } } },
    });
  }

  for (const u of users) {
    const roleRef = { connect: { slug: u.role } };
    await prisma.user.upsert({
      where: { email: u.email },
      update: { ...u, roleRef },
      create: { ...u, roleRef },
    });
  }
  for (const s of students) {
    await prisma.student.upsert({ where: { email: s.email }, update: s, create: s });
  }

  for (const name of teachingMethods) {
    await prisma.teachingMethod.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of assessmentMethods) {
    await prisma.assessmentMethod.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const c of courses) {
    const lecturer = await prisma.user.findUnique({ where: { email: c.lecturer } });
    const courseData = {
      title: c.title,
      description: c.description,
      lecturerId: lecturer?.id ?? null,
      credits: c.credits,
      prerequisites: c.prerequisites,
      courseType: c.courseType,
    };
    await prisma.course.upsert({
      where: { code: c.code },
      update: courseData,
      create: { code: c.code, ...courseData },
    });
  }

  // One co-lecturer (issue #73): CS101's primary lecturer is lecturer@dse.dev;
  // add hopper.lecturer@dse.dev as a co-lecturer so visibility/UI can be checked
  // by logging in as either.
  const cs101ForCoLecturer = await prisma.course.findUnique({ where: { code: "CS101" } });
  const coLecturer = await prisma.user.findUnique({ where: { email: "hopper.lecturer@dse.dev" } });
  if (cs101ForCoLecturer && coLecturer) {
    await prisma.courseCoLecturer.upsert({
      where: { courseId_lecturerId: { courseId: cs101ForCoLecturer.id, lecturerId: coLecturer.id } },
      update: {},
      create: { courseId: cs101ForCoLecturer.id, lecturerId: coLecturer.id },
    });
  }

  // Sample rubrics owned by the seed lecturer. Name isn't unique, so guard on
  // (name, ownerId) to keep the seed idempotent.
  const rubricOwner = await prisma.user.findUnique({ where: { email: "lecturer@dse.dev" } });
  for (const r of rubrics) {
    const existing = await prisma.rubric.findFirst({
      where: { name: r.name, ownerId: rubricOwner?.id ?? null },
    });
    if (existing) {
      await prisma.rubric.update({ where: { id: existing.id }, data: { ...r } });
    } else {
      await prisma.rubric.create({ data: { ...r, ownerId: rubricOwner?.id ?? null } });
    }
  }

  // One offering: CS101 in 2025-Fall, taught by its course lecturer, enrol 2 students.
  const cs101 = await prisma.course.findUnique({ where: { code: "CS101" } });
  if (cs101) {
    const offering = await prisma.offering.upsert({
      where: { courseId_term: { courseId: cs101.id, term: "2025-Fall" } },
      update: { capacity: 30, status: "Active", lecturerId: cs101.lecturerId },
      create: {
        courseId: cs101.id,
        term: "2025-Fall",
        capacity: 30,
        status: "Active",
        lecturerId: cs101.lecturerId,
      },
    });
    const enrolees = await prisma.student.findMany({
      where: { email: { in: ["ada@dse.dev", "alan@dse.dev"] } },
    });
    for (const s of enrolees) {
      await prisma.enrollment.upsert({
        where: { offeringId_studentId: { offeringId: offering.id, studentId: s.id } },
        update: {},
        create: { offeringId: offering.id, studentId: s.id },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${users.length} users, ${students.length} students, ${courses.length} courses, ` +
      `${teachingMethods.length} teaching + ${assessmentMethods.length} assessment methods, ` +
      `${rubrics.length} rubrics, 1 offering, ${roleDefs.length} roles, ` +
      `${permissionSlugs.length} permissions.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
