import { CalendarDays, ExternalLink, ShieldCheck } from "lucide-react";
import { PUBLIC_CALENDAR_STUDY_YEARS, publicCalendarYearHref } from "./public-calendar-year-links";

type PublicCalendarHubPageProps = {
  params: Promise<{ programmeId: string; academicYear: string }>;
};

export default async function PublicCalendarHubPage({ params }: PublicCalendarHubPageProps) {
  const { programmeId, academicYear } = await params;
  const programmeName = programmeId.toLowerCase() === "dse" ? "DSE Programme" : `${programmeId.toUpperCase()} Programme`;
  // Display only: keep the original academicYear label in all calendar URLs.
  const displayAcademicYear = academicYear.replace(/^(\d{4})-(\d{4})$/, "$1–$2");

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <CalendarDays className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{programmeName}</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Academic Calendar</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">{displayAcademicYear}</p>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Select your year to view the calendar.
              </p>
            </div>
          </div>
        </header>

        <section aria-label="Study year calendars" className="grid gap-4 sm:grid-cols-2">
          {PUBLIC_CALENDAR_STUDY_YEARS.map((studyYear) => (
            <a
              key={studyYear}
              href={publicCalendarYearHref(programmeId, academicYear, studyYear)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open Year ${studyYear} academic calendar in a new tab`}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Year {studyYear}</h2>
                <ExternalLink className="h-5 w-5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-primary">View calendar</p>
            </a>
          ))}
        </section>

        <footer className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>Only published academic calendars are shown.</p>
        </footer>
      </div>
    </main>
  );
}
