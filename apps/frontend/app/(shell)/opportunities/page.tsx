import { ArrowUpRight, CalendarDays, Globe2, Sparkles, Trophy, Users } from "lucide-react";
import { studentOpportunities } from "@/lib/student-opportunities";

function FitStars({ score }: { score: number }) {
  return (
    <span className="font-medium text-amber-700 dark:text-amber-300" aria-label={`${score} out of 5 DSE fit`}>
      {"★".repeat(score)}{"☆".repeat(5 - score)}
    </span>
  );
}

export default function OpportunitiesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-background via-background to-muted/60 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Verified opportunities for DSE students
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Student Opportunities</h1>
              <p className="mt-2 text-muted-foreground">
                Hackathons, competitions and other growth opportunities selected for DSE students. Only verified, currently relevant opportunities are published here.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{studentOpportunities.length}</span> opportunities currently recommended
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {studentOpportunities.map((opportunity) => (
          <article
            key={opportunity.slug}
            className={`flex flex-col rounded-3xl border bg-card p-5 shadow-sm sm:p-6 ${opportunity.featured ? "ring-1 ring-primary/20" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{opportunity.category}</span>
                  {opportunity.featured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                      <Trophy className="h-3.5 w-3.5" /> Top recommendation
                    </span>
                  ) : null}
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{opportunity.title}</h2>
                  <p className="text-sm text-muted-foreground">{opportunity.organizer}</p>
                </div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-right text-xs text-muted-foreground">
                <div>DSE fit</div>
                <FitStars score={opportunity.dseFit} />
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted-foreground">{opportunity.summary}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {opportunity.themes.map((theme) => (
                <span key={theme} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {theme}
                </span>
              ))}
            </div>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex gap-2 rounded-2xl bg-muted/50 p-3">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Dates</dt>
                  <dd className="font-medium">{opportunity.eventDates}</dd>
                  {opportunity.deadline ? <dd className="mt-1 text-xs text-destructive">Deadline: {opportunity.deadline}</dd> : null}
                </div>
              </div>
              <div className="flex gap-2 rounded-2xl bg-muted/50 p-3">
                <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Format</dt>
                  <dd className="font-medium">{opportunity.format}</dd>
                </div>
              </div>
              <div className="flex gap-2 rounded-2xl bg-muted/50 p-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Eligibility</dt>
                  <dd>{opportunity.eligibility}</dd>
                  {opportunity.teamSize ? <dd className="mt-1 text-xs text-muted-foreground">Team: {opportunity.teamSize}</dd> : null}
                </div>
              </div>
              <div className="flex gap-2 rounded-2xl bg-muted/50 p-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Difficulty</dt>
                  <dd className="font-medium">{opportunity.difficulty}</dd>
                </div>
              </div>
            </dl>

            <div className="mt-5 rounded-2xl border border-dashed p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Faculty note</p>
              <p className="mt-1 text-sm leading-6">{opportunity.facultyNote}</p>
            </div>

            <div className="mt-auto pt-5">
              <a
                href={opportunity.officialUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                View official opportunity
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </article>
        ))}
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Opportunities may change after publication. Always confirm the latest eligibility, dates and submission rules on the official organizer page before applying.
      </p>
    </div>
  );
}
