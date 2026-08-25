import { readFileSync, writeFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function write(path: string, content: string): void {
  writeFileSync(path, content);
}

function replaceOnce(path: string, before: string, after: string): void {
  const source = read(path);
  if (!source.includes(before)) {
    throw new Error(`Pattern not found in ${path}: ${before.slice(0, 160)}`);
  }
  write(path, source.replace(before, after));
}

function replaceAll(path: string, before: string, after: string): void {
  const source = read(path);
  if (!source.includes(before)) {
    throw new Error(`Pattern not found in ${path}: ${before.slice(0, 160)}`);
  }
  write(path, source.split(before).join(after));
}

// Admin Academic Calendar: make status/coverage scannable, keep editing actions visible,
// and surface publish as an explicit second step after draft review.
{
  const path = "apps/frontend/app/(shell)/academic-calendar/academic-calendar-client.tsx";

  replaceOnce(
    path,
    "  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? calendarForStudyYear;\n",
    `  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? calendarForStudyYear;
  const yearCoverage = STUDY_YEARS.map((year) => {
    const matches = calendars.filter((calendar) => calendar.studyYears.includes(year));
    const calendar = matches.find((item) => item.status === "Published")
      ?? matches.find((item) => item.status === "Draft")
      ?? matches[0]
      ?? null;
    return { year, calendar };
  });
  const publishedCoverage = yearCoverage.filter((item) => item.calendar?.status === "Published").length;
  const draftCoverage = yearCoverage.filter((item) => item.calendar?.status === "Draft").length;
  const missingCoverage = yearCoverage.filter((item) => !item.calendar).length;
`,
  );

  replaceOnce(
    path,
    "            <h2 className=\"mt-1 text-xl font-semibold\">Official academic periods</h2>\n            <p className=\"mt-1 text-sm text-muted-foreground\">Published revisions are immutable. Corrections use a new auditable revision.</p>",
    "            <h2 className=\"mt-1 text-xl font-semibold\">Academic Calendar workspace</h2>\n            <p className=\"mt-1 max-w-2xl text-sm text-muted-foreground\">Manage one official source of semester dates. Draft safely, review coverage by study year, then publish an immutable revision.</p>",
  );

  replaceOnce(
    path,
    "        {showNewYear ? <div className=\"mt-4 grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-4\">",
    `        {selectedYear ? (
          <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-500/8 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Published coverage</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{publishedCoverage}<span className="text-sm font-medium text-muted-foreground"> / 4 years</span></p>
            </div>
            <div className="rounded-xl bg-amber-500/8 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Draft coverage</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{draftCoverage}</p>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Not available</p>
              <p className="mt-1 text-2xl font-bold">{missingCoverage}</p>
            </div>
          </div>
        ) : null}
        {showNewYear ? <div className="mt-4 grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-4">`,
  );

  replaceOnce(
    path,
    "className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedStudyYear === year ? \"border-primary bg-primary/5\" : \"border-border bg-card hover:border-primary/40\"}`}",
    "className={`group relative overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedStudyYear === year ? \"border-primary bg-primary/5 ring-1 ring-primary/15\" : \"border-border bg-card hover:border-primary/40\"}`}",
  );

  replaceOnce(
    path,
    "<p className=\"text-xs font-semibold uppercase tracking-wide text-muted-foreground\">Study Year</p><p className=\"mt-1 text-2xl font-bold\">Year {year}</p>",
    "<p className=\"text-xs font-semibold uppercase tracking-wide text-muted-foreground\">Study year</p><div className=\"mt-2 flex items-center gap-2\"><span className=\"flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary\">{year}</span><p className=\"text-base font-semibold\">Year {year} calendar</p></div>",
  );

  replaceOnce(
    path,
    "<div className=\"mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between\"><div><h3 className=\"text-lg font-semibold\">{creating ? \"Add Academic Calendar\" : `Edit Draft · Revision ${selectedCalendar?.revision ?? 1}`}</h3><p className=\"text-sm text-muted-foreground\">Dates are not student-visible until publication.</p></div><div className=\"flex gap-2\"><Button variant=\"outline\" onClick={() => { setCreating(false); setEditing(false); if (selectedCalendar) setDraft(fromCalendar(selectedCalendar)); }}>Cancel</Button><Button disabled={saving} onClick={() => void saveDraft()}>{saving ? \"Saving…\" : \"Save Draft\"}</Button></div></div>",
    "<div className=\"sticky top-0 z-10 -mx-4 mb-6 flex flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-6\"><div><div className=\"flex flex-wrap items-center gap-2\"><h3 className=\"text-lg font-semibold\">{creating ? \"Add Academic Calendar\" : `Edit Draft · Revision ${selectedCalendar?.revision ?? 1}`}</h3><span className=\"rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300\">DRAFT · NOT STUDENT-VISIBLE</span></div><p className=\"mt-1 text-sm text-muted-foreground\">Complete the official dates and provenance, then save for review before publishing.</p></div><div className=\"flex shrink-0 gap-2\"><Button variant=\"outline\" onClick={() => { setCreating(false); setEditing(false); if (selectedCalendar) setDraft(fromCalendar(selectedCalendar)); }}>Cancel</Button><Button disabled={saving} onClick={() => void saveDraft()}>{saving ? \"Saving…\" : \"Save Draft\"}</Button></div></div>",
  );

  replaceOnce(
    path,
    "<div className=\"flex flex-wrap gap-2\">{selectedCalendar.status === \"Draft\" ? <Button onClick={() => { setDraft(fromCalendar(selectedCalendar)); setEditing(true); }}>Edit draft</Button> : null}</div>",
    "<div className=\"flex flex-wrap gap-2\">{selectedCalendar.status === \"Draft\" ? <><Button variant=\"outline\" onClick={() => { setDraft(fromCalendar(selectedCalendar)); setEditing(true); }}>Edit draft</Button><Button disabled={saving} onClick={() => void publish()}><CheckCircle2 className=\"h-4 w-4\" /> Publish official calendar</Button></> : null}</div>",
  );

  replaceOnce(
    path,
    "      <fieldset>\n        <legend className=\"text-sm font-semibold\">Applies to Study Year(s)</legend>",
    "      <fieldset className=\"rounded-2xl border border-border bg-muted/10 p-4\">\n        <legend className=\"px-1 text-sm font-semibold\"><span className=\"mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground\">1</span>Study year coverage</legend>\n        <p className=\"mt-1 text-xs text-muted-foreground\">Select one year or intentionally share one calendar across multiple study years.</p>",
  );

  replaceOnce(
    path,
    "      </fieldset>\n\n      <div className=\"grid gap-4 xl:grid-cols-2\">",
    "      </fieldset>\n\n      <section>\n        <div className=\"mb-3\"><h4 className=\"text-sm font-semibold\"><span className=\"mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground\">2</span>Semester dates</h4><p className=\"mt-1 text-xs text-muted-foreground\">Teaching dates are canonical. Exam and break windows stay optional until officially issued.</p></div>\n      <div className=\"grid gap-4 xl:grid-cols-2\">",
  );

  replaceOnce(
    path,
    "      </div>\n\n      <section className=\"rounded-xl border border-border p-4\">\n        <div className=\"flex items-center justify-between gap-3\">\n          <div><h4 className=\"font-semibold\">Additional events</h4>",
    "      </div>\n      </section>\n\n      <section className=\"rounded-2xl border border-border p-4\">\n        <div className=\"flex items-center justify-between gap-3\">\n          <div><h4 className=\"font-semibold\"><span className=\"mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground\">3</span>Academic events</h4>",
  );

  replaceOnce(
    path,
    "      <section className=\"rounded-xl border border-border p-4\">\n        <h4 className=\"font-semibold\">Official source / provenance</h4>",
    "      <section className=\"rounded-2xl border border-primary/20 bg-primary/[0.025] p-4\">\n        <h4 className=\"font-semibold\"><span className=\"mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground\">4</span>Official source / provenance</h4>",
  );
}

// Offering creation: show a four-step readiness strip and keep final actions visible.
{
  const path = "apps/frontend/app/(shell)/offerings/offering-form-page.tsx";

  replaceOnce(
    path,
    "  const semester = useWatch({ control, name: \"semester\" }) ?? null;\n",
    `  const semester = useWatch({ control, name: "semester" }) ?? null;
  const courseSpecId = useWatch({ control, name: "courseSpecId" }) ?? "";
  const meetings = useWatch({ control, name: "meetings" }) ?? [];
`,
  );

  replaceOnce(
    path,
    "  const createBlocked = !editing && (!calendarContext || calendarLoading || courses.length === 0);\n",
    `  const createBlocked = !editing && (!calendarContext || calendarLoading || courses.length === 0);
  const setupSteps = [
    { label: "Academic period", complete: legacyOffering || Boolean(calendarContext) },
    { label: "Course & spec", complete: Boolean(courseId && courseSpecId) },
    { label: "Weekly schedule", complete: meetings.length > 0 },
    { label: "Teaching team", complete: Boolean(lecturerId) },
  ];
`,
  );

  replaceOnce(path, "<div className=\"mx-auto max-w-3xl space-y-4\">", "<div className=\"mx-auto max-w-5xl space-y-4\">");

  replaceOnce(
    path,
    "            <form onSubmit={onSubmit} className=\"space-y-6 rounded-xl border border-border bg-card p-4 md:p-6\">\n              <OfferingFormFields",
    `            <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
              <section aria-label="Offering setup progress" className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  {setupSteps.map((step, index) => (
                    <div key={step.label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${step.complete ? "bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${step.complete ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>
                        {step.complete ? "✓" : index + 1}
                      </span>
                      {step.label}
                    </div>
                  ))}
                </div>
              </section>
              <OfferingFormFields`,
  );

  replaceOnce(
    path,
    "              <div className=\"flex items-center justify-end gap-2 border-t border-border pt-4\">",
    "              <div className=\"sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6\"><p className=\"hidden text-xs text-muted-foreground sm:block\">Teaching dates are locked to the resolved published calendar.</p><div className=\"ml-auto flex items-center gap-2\">",
  );

  replaceOnce(
    path,
    "              </div>\n            </form>",
    "              </div></div>\n            </form>",
  );
}

// Offering field hierarchy: number the workflow, improve responsive layout, and make
// automatic calendar resolution more obvious.
{
  const path = "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx";

  replaceOnce(path, "<fieldset className=\"space-y-4 rounded-xl border border-border p-4\">", "<fieldset className=\"space-y-4 rounded-2xl border border-border bg-muted/10 p-4 md:p-5\">");
  replaceOnce(path, "<legend className=\"text-sm font-semibold text-foreground\">Academic context</legend>", "<legend className=\"text-sm font-semibold text-foreground\"><span className=\"mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground\">1</span>Academic context</legend>");
  replaceOnce(path, "Published Calendar</p>", "Calendar resolved automatically</p>");

  replaceOnce(
    path,
    "      <Field label=\"Course\" error={errors.courseId?.message} required>",
    "      <SectionHeading number=\"2\" title=\"Course & specification\" description=\"Only courses placed in the applicable active curriculum are available.\" />\n      <Field label=\"Course\" error={errors.courseId?.message} required>",
  );

  replaceOnce(
    path,
    "        <CoursePickerField control={control} courses={courses} disabled={courseLocked || (!legacyTeachingPeriod && !calendarContext)} />\n        {!legacyTeachingPeriod",
    "        <CoursePickerField control={control} courses={courses} disabled={courseLocked || (!legacyTeachingPeriod && !calendarContext)} />\n        {!legacyTeachingPeriod && calendarContext ? <p className=\"mt-1 text-xs text-muted-foreground\">{courses.length} curriculum course{courses.length === 1 ? \"\" : \"s\"} available for this period.</p> : null}\n        {!legacyTeachingPeriod",
  );

  replaceOnce(path, "Weekly Class Schedule <span", "<span className=\"mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground\">3</span>Weekly class schedule <span");
  replaceOnce(path, "<fieldset className=\"space-y-3 rounded-lg border border-border p-4\">", "<fieldset className=\"space-y-3 rounded-2xl border border-border p-4 md:p-5\">");

  replaceOnce(
    path,
    "      <div className=\"grid grid-cols-2 gap-3\">\n        <Field label=\"Capacity\"",
    "      <SectionHeading number=\"4\" title=\"Teaching team & delivery status\" description=\"Assign the lecturer responsible for this section and confirm operational details.\" />\n      <div className=\"grid grid-cols-2 gap-3\">\n        <Field label=\"Capacity\"",
  );

  replaceAll(path, "className=\"grid grid-cols-2 gap-3\"", "className=\"grid gap-3 sm:grid-cols-2\"");

  replaceOnce(
    path,
    "function CoursePickerField({ control, courses, disabled }:",
    `function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-foreground">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{number}</span>
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function CoursePickerField({ control, courses, disabled }:`,
  );
}
