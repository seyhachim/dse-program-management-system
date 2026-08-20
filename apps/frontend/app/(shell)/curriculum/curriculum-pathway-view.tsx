import type {
  CurriculumPathway,
  CurriculumSemesterGroup,
} from "@dse-pms/shared-types";

export function pathwaysForSemester(
  pathways: CurriculumPathway[],
  yearLevel: number,
  semester: CurriculumSemesterGroup["semester"],
) {
  return pathways
    .filter(
      (pathway) =>
        pathway.yearLevel === yearLevel && pathway.semester === semester,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function CourseList({ courses }: { courses: CurriculumSemesterGroup["courses"] }) {
  if (!courses.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
        No courses assigned
      </p>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {courses.map((course) => (
        <div key={course.placementId} className="p-3">
          <p className="text-xs font-semibold text-muted-foreground">{course.code}</p>
          <p className="text-sm font-medium">{course.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {course.courseType} · {course.credits} credits
          </p>
        </div>
      ))}
    </div>
  );
}

export function CurriculumPathwayView({
  yearLevel,
  semester,
  pathways,
}: {
  yearLevel: number;
  semester: CurriculumSemesterGroup;
  pathways: CurriculumPathway[];
}) {
  const semesterPathways = pathwaysForSemester(
    pathways,
    yearLevel,
    semester.semester,
  );

  if (semesterPathways.length <= 1) {
    return <CourseList courses={semester.courses} />;
  }

  const commonCourses = semester.courses.filter((course) => course.pathwayId === null);

  return (
    <div className="space-y-4">
      {commonCourses.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Common courses
          </p>
          <CourseList courses={commonCourses} />
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <div>
          <p className="text-sm font-semibold text-blue-950">
            Choose one of {semesterPathways.length} pathways
          </p>
          <p className="mt-1 text-xs text-blue-900/80">
            Students complete exactly one of the following pathways. These credits are
            mutually exclusive and are not added together.
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          {semesterPathways.map((pathway) => (
            <section key={pathway.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="text-sm font-semibold">{pathway.name}</h5>
                    {pathway.isDefault && (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                        Default for totals
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pathway.courses.length} {pathway.courses.length === 1 ? "course" : "courses"} · {pathway.totalCredits} credits
                  </p>
                </div>
                {pathway.creditTarget !== null && pathway.creditTarget !== pathway.totalCredits && (
                  <span className="text-xs text-amber-700">
                    Target {pathway.creditTarget} credits
                  </span>
                )}
              </div>

              <div className="mt-3 divide-y rounded-md border">
                {pathway.courses.map((course) => (
                  <div key={course.placementId} className="p-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">{course.code}</p>
                    <p className="text-sm font-medium">{course.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {course.courseType} · {course.credits} credits
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
