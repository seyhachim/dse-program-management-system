"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  BriefcaseBusiness,
  GraduationCap,
  Mail,
  Pencil,
  Phone,
  UserRound,
} from "lucide-react";
import {
  formatLecturerDisplayName,
  semesterLabel,
  type Lecturer,
  type OfferingView,
} from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { lecturersApi } from "@/lib/lecturers";
import { LecturerAvatar } from "@/components/lecturer-avatar";
import { offeringsApi } from "@/lib/offerings";
import { Topbar } from "../topbar";
import {
  buildLecturerTeachingRows,
  currentLecturerTeachingRows,
  uniqueTeachingCourseCount,
} from "./lecturer-portfolio-model";

export function LecturerPortfolioClient() {
  const [lecturer, setLecturer] = useState<Lecturer | null>(null);
  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([lecturersApi.me(), offeringsApi.list()])
      .then(([profile, assignedOfferings]) => {
        if (cancelled) return;
        setLecturer(profile);
        setOfferings(assignedOfferings);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your lecturer portfolio");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const teachingRows = useMemo(
    () => lecturer ? buildLecturerTeachingRows(offerings, lecturer.id) : [],
    [lecturer, offerings],
  );
  const currentTeaching = useMemo(() => currentLecturerTeachingRows(teachingRows), [teachingRows]);
  const primarySections = currentTeaching.filter((row) => row.role === "Primary Lecturer").length;
  const coLecturerSections = currentTeaching.length - primarySections;
  const currentCourses = uniqueTeachingCourseCount(currentTeaching);

  return (
    <>
      <Topbar
        title="My Portfolio"
        subtitle="Your professional profile and PMS-verified teaching record."
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading your portfolio…
            </div>
          ) : error || !lecturer ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error ?? "Lecturer profile unavailable"}
            </div>
          ) : (
            <>
              <PortfolioHero lecturer={lecturer} />

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-6">
                  <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-primary" />
                          <h2 className="font-semibold text-foreground">Current Teaching</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Derived from your official PMS course offerings; this list is not manually editable here.
                        </p>
                      </div>
                      <Link href="/lecturer-overview" className="shrink-0 text-sm font-medium text-primary hover:underline">
                        Teaching overview
                      </Link>
                    </div>

                    {currentTeaching.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="font-medium text-foreground">No current teaching assignments</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Active or planned offerings assigned to you will appear here automatically.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {currentTeaching.map(({ offering, role }) => (
                          <div key={offering.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <div className="min-w-0">
                              {offering.course ? (
                                <Link href={`/courses/${offering.course.id}/spec`} className="font-medium text-foreground hover:underline">
                                  <span className="text-primary">{offering.course.code}</span>
                                  <span className="mx-2 text-muted-foreground">—</span>
                                  {offering.course.title}
                                </Link>
                              ) : (
                                <p className="font-medium text-muted-foreground">Course unavailable</p>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">
                                {offering.term} · {offering.programmeYear ? `Year ${offering.programmeYear}` : "Year not set"} · {semesterLabel(offering.semester)} · Section {offering.sectionCode}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                                {role}
                              </span>
                              <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                                {offering.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold text-foreground">Professional Background</h2>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Detail label="Academic position" value={lecturer.title} />
                      <Detail label="Qualification" value={lecturer.qualification} />
                      <Detail label="Employment type" value={lecturer.professionalProfile?.employmentType} />
                      <Detail
                        label="Years of experience"
                        value={lecturer.professionalProfile?.yearsOfExperience == null ? null : `${lecturer.professionalProfile.yearsOfExperience} years`}
                      />
                      <Detail label="DSE programme start date" value={lecturer.professionalProfile?.programmeStartDate} />
                      <div className="sm:col-span-2">
                        <Detail label="Field of specialization" value={lecturer.professionalProfile?.fieldOfSpecialization} />
                      </div>
                      <div className="sm:col-span-2">
                        <Detail label="Short bio" value={lecturer.professionalProfile?.shortBio} />
                      </div>
                    </div>
                  </section>

                  {lecturer.professionalProfile?.legacyCoursesTaught ? (
                    <section className="rounded-xl border border-border bg-muted/20 p-5">
                      <h2 className="text-sm font-semibold text-foreground">Imported historical teaching note</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {lecturer.professionalProfile.legacyCoursesTaught}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Historical source text only. Current teaching above comes from official Course/Offering assignments.
                      </p>
                    </section>
                  ) : null}
                </div>

                <aside className="space-y-6">
                  <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="font-semibold text-foreground">Portfolio Summary</h2>
                    <div className="mt-4 space-y-4">
                      <Stat label="Current courses" value={String(currentCourses)} />
                      <Stat label="Current sections" value={String(currentTeaching.length)} />
                      <Stat label="Primary lecturer" value={String(primarySections)} />
                      <Stat label="Co-lecturer" value={String(coLecturerSections)} />
                      <Stat label="All teaching records" value={String(teachingRows.length)} />
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="font-semibold text-foreground">Portfolio Sources</h2>
                    <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                      <SourceRow icon={<UserRound className="h-4 w-4" />} text="Professional details come from your lecturer profile." />
                      <SourceRow icon={<BookOpen className="h-4 w-4" />} text="Teaching comes from official PMS offerings." />
                      <SourceRow icon={<GraduationCap className="h-4 w-4" />} text="Approved academic records remain unchanged by portfolio edits." />
                    </div>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function PortfolioHero({ lecturer }: { lecturer: Lecturer }) {
  const initials = lecturer.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const profile = lecturer.professionalProfile;
  const tags = [
    profile?.employmentType,
    profile?.yearsOfExperience == null ? null : `${profile.yearsOfExperience} years experience`,
    profile?.fieldOfSpecialization,
  ].filter((value): value is string => Boolean(value));

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          <LecturerAvatar name={lecturer.name} imageUrl={lecturer.profileImageUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {formatLecturerDisplayName(lecturer.name, lecturer.honorific)}
            </h1>
            <p className="mt-1 font-medium text-primary">{lecturer.title || "Lecturer"}</p>
            {lecturer.qualification ? <p className="mt-1 text-sm text-muted-foreground">{lecturer.qualification}</p> : null}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" />{lecturer.email}</span>
              {lecturer.phone ? <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{lecturer.phone}</span> : null}
            </div>
            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Add professional details to complete your portfolio profile.</p>
            )}
          </div>
        </div>
        <Link
          href="/account-settings"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="h-4 w-4" />
          Edit Profile
        </Link>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-muted/15 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "Not provided"}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function SourceRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span className="leading-5">{text}</span>
    </div>
  );
}
