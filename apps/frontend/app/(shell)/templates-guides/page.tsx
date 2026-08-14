import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutList,
  ListChecks,
  Route,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import { Topbar } from "../topbar";

const guides = [
  {
    title: "Course Specification Checklist",
    description:
      "Use this as the overall sequence for completing a course specification before review and submission.",
    icon: ListChecks,
    items: [
      "Confirm course information and teaching assignment",
      "Write measurable CLOs and map them to PLOs",
      "Define teaching and learning strategies",
      "Build assessments and align them to CLOs",
      "Complete the weekly teaching plan",
      "Check constructive alignment",
      "Add resources, responsibilities, and policies",
      "Review the document before submission",
    ],
  },
  {
    title: "CLO Writing Guide",
    description:
      "Keep CLOs observable, assessable, and aligned with the programme learning outcomes.",
    icon: GraduationCap,
    items: [
      "Start with an observable action verb",
      "Describe what students should demonstrate by the end of the course",
      "Use one clear outcome per CLO",
      "Choose the intended cognitive, affective, or psychomotor level",
      "Map every active CLO to at least one PLO",
    ],
  },
  {
    title: "Assessment Design Guide",
    description:
      "Design an assessment plan that provides enough evidence for the CLOs without over-assessing students.",
    icon: ClipboardCheck,
    items: [
      "Choose the assessment purpose first",
      "Map each assessment to the CLOs it measures",
      "Set weights that total 100%",
      "Use suitable individual or group assessment modes",
      "Add a rubric when judgement criteria need to be explicit",
    ],
  },
  {
    title: "Weekly Plan Guide",
    description:
      "Turn the course design into a practical week-by-week teaching plan for lecturers and students.",
    icon: LayoutList,
    items: [
      "State the weekly topic and intended learning focus",
      "Select teaching methods and student learning activities",
      "Connect activities to the relevant CLOs",
      "Plan assessment preparation and evidence where appropriate",
      "Track project-based learning progress when the course uses a project",
    ],
  },
  {
    title: "Constructive Alignment Guide",
    description:
      "Check that outcomes, teaching activities, learning time, and assessment evidence tell the same academic story.",
    icon: Route,
    items: [
      "Every CLO should be intentionally taught",
      "Every CLO should have assessment evidence",
      "Weekly activities should support the intended CLO level",
      "Assessment methods should match the kind of performance expected",
      "Resolve unmapped or weakly supported CLOs before submission",
    ],
  },
  {
    title: "Review & Submission Guide",
    description:
      "Perform a final quality check before submitting the course specification for review.",
    icon: CheckCircle2,
    items: [
      "Clear all incomplete sections shown in My Tasks",
      "Review the generated document preview",
      "Check terminology and course consistency",
      "Confirm assessment weights and alignment",
      "Submit only when the specification is ready for reviewer feedback",
    ],
  },
] as const;

export default function TemplatesGuidesPage() {
  return (
    <>
      <Topbar
        title="Templates & Guides"
        subtitle="Practical DSE guidance for planning, aligning, and reviewing your courses."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">Start from your course</h2>
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  These guides support the course-design workflow. Open a course to apply them directly while editing CLOs, teaching and learning, assessments, weekly plans, and alignment.
                </p>
              </div>
              <Button render={<Link href="/courses">Open My Courses</Link>} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {guides.map((guide) => {
              const Icon = guide.icon;
              return (
                <article
                  key={guide.title}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-xl border border-border bg-muted/40 p-2.5">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold">{guide.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {guide.description}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {guide.items.map((item) => (
                      <li key={item} className="flex gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>

          <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-medium">Document templates can be added later</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This first version keeps guidance inside the system so it is always available. Official DSE downloadable templates, policy documents, and example course specifications can be added here once the programme approves the canonical files.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
