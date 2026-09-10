"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FinalProjectSupervisorOverview,
  FinalProjectSupervisorProfile,
  UpsertFinalProjectSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { Button, FormFieldLabel, Input } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { finalProjectApi } from "@/lib/final-project";

const EMPTY_FORM: UpsertFinalProjectSupervisorProfileInput = {
  statement: "",
  capacity: 0,
  acceptingStudents: false,
  isPublished: false,
  tracks: [],
};

export function FinalProjectClient() {
  const { me, loading: meLoading } = useMe();
  const [profiles, setProfiles] = useState<FinalProjectSupervisorProfile[]>([]);
  const [overview, setOverview] = useState<FinalProjectSupervisorOverview | null>(null);
  const [form, setForm] = useState<UpsertFinalProjectSupervisorProfileInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyAccepting, setOnlyAccepting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const currentRoles = me.roles;
    let active = true;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const discovery = await finalProjectApi.discovery();
        if (!active) return;
        setProfiles(discovery);

        if (currentRoles.includes("lecturer")) {
          const own = await finalProjectApi.me();
          if (!active) return;
          setForm(own ? toForm(own) : EMPTY_FORM);
        }

        if (currentRoles.includes("admin") || currentRoles.includes("program_coordinator")) {
          const programmeOverview = await finalProjectApi.overview();
          if (!active) return;
          setOverview(programmeOverview);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Could not load Final Project information");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [me]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => {
      if (onlyAccepting && !(profile.acceptingStudents && profile.availableSlots > 0)) return false;
      if (!query) return true;
      const searchable = [
        profile.lecturer.name,
        profile.lecturer.academicPosition ?? "",
        profile.lecturer.qualification ?? "",
        profile.lecturer.fieldOfSpecialization ?? "",
        profile.statement,
        ...profile.tracks.flatMap((track) => [
          track.title,
          track.description,
          ...track.ideas.flatMap((idea) => [idea.title, idea.summary, ...idea.skills]),
        ]),
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [onlyAccepting, profiles, search]);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;
  const isLecturer = me?.roles.includes("lecturer") ?? false;
  const isManager = me?.roles.some((role) => role === "admin" || role === "program_coordinator") ?? false;

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await finalProjectApi.updateMe(form);
      setForm(toForm(updated));
      const [discovery, programmeOverview] = await Promise.all([
        finalProjectApi.discovery(),
        isManager ? finalProjectApi.overview() : Promise.resolve(null),
      ]);
      setProfiles(discovery);
      if (programmeOverview) setOverview(programmeOverview);
      setMessage("Supervisor discovery profile saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save supervisor profile");
    } finally {
      setSaving(false);
    }
  }

  if (meLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading Final Project workspace…</p>;
  }

  if (!me) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {message ? (
        <p className="rounded-lg border border-status-live/30 bg-status-live-bg p-3 text-sm text-status-live">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isManager && overview ? <ProgrammeOverview overview={overview} /> : null}
      {isLecturer ? (
        <SupervisorEditor form={form} setForm={setForm} saving={saving} onSubmit={saveProfile} />
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Find a supervisor</h2>
            <p className="text-sm text-muted-foreground">
              Browse published supervision areas and example project directions. Applications are a later phase.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search AI, agriculture, LLM…"
              aria-label="Search supervisors"
            />
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-foreground">
              <input
                type="checkbox"
                checked={onlyAccepting}
                onChange={(event) => setOnlyAccepting(event.target.checked)}
              />
              Open only
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="font-medium text-foreground">No matching published supervisors yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lecturers can publish their supervision profile from this workspace.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((profile) => (
              <SupervisorCard
                key={profile.id}
                profile={profile}
                onOpen={() => setSelectedId(profile.id)}
              />
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <SupervisorDetail profile={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

function ProgrammeOverview({ overview }: { overview: FinalProjectSupervisorOverview }) {
  const stats = [
    ["Profiles", overview.totalSupervisors],
    ["Published", overview.publishedSupervisors],
    ["Accepting", overview.acceptingSupervisors],
    ["Capacity", overview.totalCapacity],
    ["Current load", overview.currentLoad],
    ["Open slots", overview.availableSlots],
  ] as const;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold text-foreground">Programme supervision overview</h2>
        <p className="text-sm text-muted-foreground">Read-only capacity view for programme coordination.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SupervisorCard({
  profile,
  onOpen,
}: {
  profile: FinalProjectSupervisorProfile;
  onOpen: () => void;
}) {
  const open = profile.acceptingStudents && profile.availableSlots > 0;
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{displayName(profile)}</h3>
          <p className="text-sm text-muted-foreground">
            {profile.lecturer.fieldOfSpecialization ?? profile.lecturer.academicPosition ?? "DSE Lecturer"}
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
          {open ? "Accepting" : profile.acceptingStudents ? "Full" : "Not accepting"}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
        {profile.statement || "Open the profile to see research tracks and project directions."}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {profile.tracks.slice(0, 4).map((track) => (
          <span key={track.id} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
            {track.title}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="text-xs text-muted-foreground">
          {profile.currentLoad}/{profile.capacity} supervised · {profile.availableSlots} open
        </span>
        <Button type="button" onClick={onOpen}>View profile</Button>
      </div>
    </article>
  );
}

function SupervisorDetail({
  profile,
  onClose,
}: {
  profile: FinalProjectSupervisorProfile;
  onClose: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supervisor profile</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{displayName(profile)}</h2>
          <p className="text-sm text-muted-foreground">
            {[profile.lecturer.academicPosition, profile.lecturer.qualification].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      {profile.statement ? <p className="mt-4 max-w-3xl text-sm leading-6 text-foreground">{profile.statement}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">
        Capacity: {profile.currentLoad}/{profile.capacity} · {profile.availableSlots} open slot(s)
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {profile.tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-border p-4">
            <h3 className="font-semibold text-foreground">{track.title}</h3>
            {track.description ? <p className="mt-1 text-sm text-muted-foreground">{track.description}</p> : null}
            {track.ideas.length > 0 ? (
              <div className="mt-3 space-y-3">
                {track.ideas.map((idea) => (
                  <div key={idea.id}>
                    <p className="text-sm font-medium text-foreground">{idea.title}</p>
                    {idea.summary ? <p className="text-xs text-muted-foreground">{idea.summary}</p> : null}
                    {idea.skills.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">Skills: {idea.skills.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SupervisorEditor({
  form,
  setForm,
  saving,
  onSubmit,
}: {
  form: UpsertFinalProjectSupervisorProfileInput;
  setForm: React.Dispatch<React.SetStateAction<UpsertFinalProjectSupervisorProfileInput>>;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  function updateTrack(index: number, field: "title" | "description", value: string) {
    setForm((current) => ({
      ...current,
      tracks: current.tracks.map((track, trackIndex) =>
        trackIndex === index ? { ...track, [field]: value } : track,
      ),
    }));
  }

  function updateIdea(
    trackIndex: number,
    ideaIndex: number,
    field: "title" | "summary" | "skills",
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      tracks: current.tracks.map((track, currentTrackIndex) => {
        if (currentTrackIndex !== trackIndex) return track;
        return {
          ...track,
          ideas: track.ideas.map((idea, currentIdeaIndex) => {
            if (currentIdeaIndex !== ideaIndex) return idea;
            return {
              ...idea,
              [field]: field === "skills"
                ? value.split(",").map((skill) => skill.trim()).filter(Boolean)
                : value,
            };
          }),
        };
      }),
    }));
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h2 className="font-semibold text-foreground">My supervisor profile</h2>
        <p className="text-sm text-muted-foreground">
          Publish only information students need to judge supervision fit. This does not assign any student.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        <label className="block space-y-1.5">
          <FormFieldLabel>Supervision statement</FormFieldLabel>
          <textarea
            value={form.statement}
            onChange={(event) => setForm((current) => ({ ...current, statement: event.target.value }))}
            rows={4}
            maxLength={4000}
            placeholder="What kinds of students/projects do you supervise? What working style should students expect?"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <FormFieldLabel>Maximum students</FormFieldLabel>
            <Input
              type="number"
              min={0}
              max={20}
              step={1}
              value={form.capacity}
              onChange={(event) => setForm((current) => ({
                ...current,
                capacity: Number(event.target.value),
                acceptingStudents: Number(event.target.value) > 0 ? current.acceptingStudents : false,
              }))}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.acceptingStudents}
              disabled={form.capacity === 0}
              onChange={(event) => setForm((current) => ({ ...current, acceptingStudents: event.target.checked }))}
            />
            Accepting students
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))}
            />
            Visible to students
          </label>
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Research tracks & example ideas</h3>
              <p className="text-xs text-muted-foreground">Examples guide discovery; they are not approved proposals.</p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => setForm((current) => ({
                ...current,
                tracks: [...current.tracks, { title: "", description: "", ideas: [] }],
              }))}
            >
              + Add track
            </button>
          </div>

          {form.tracks.map((track, trackIndex) => (
            <div key={trackIndex} className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={track.title}
                  onChange={(event) => updateTrack(trackIndex, "title", event.target.value)}
                  placeholder="Research track, e.g. AI for Agriculture"
                  required
                />
                <Input
                  value={track.description}
                  onChange={(event) => updateTrack(trackIndex, "description", event.target.value)}
                  placeholder="Short description"
                />
              </div>

              {track.ideas.map((idea, ideaIndex) => (
                <div key={ideaIndex} className="grid gap-2 border-l-2 border-border pl-3 sm:grid-cols-3">
                  <Input
                    value={idea.title}
                    onChange={(event) => updateIdea(trackIndex, ideaIndex, "title", event.target.value)}
                    placeholder="Example project idea"
                    required
                  />
                  <Input
                    value={idea.summary}
                    onChange={(event) => updateIdea(trackIndex, ideaIndex, "summary", event.target.value)}
                    placeholder="Short direction"
                  />
                  <Input
                    value={idea.skills.join(", ")}
                    onChange={(event) => updateIdea(trackIndex, ideaIndex, "skills", event.target.value)}
                    placeholder="Skills, comma separated"
                  />
                </div>
              ))}

              <div className="flex flex-wrap gap-4 text-sm">
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => setForm((current) => ({
                    ...current,
                    tracks: current.tracks.map((currentTrack, currentTrackIndex) =>
                      currentTrackIndex === trackIndex
                        ? {
                            ...currentTrack,
                            ideas: [...currentTrack.ideas, { title: "", summary: "", skills: [] }],
                          }
                        : currentTrack,
                    ),
                  }))}
                >
                  + Add idea
                </button>
                <button
                  type="button"
                  className="font-medium text-destructive underline-offset-4 hover:underline"
                  onClick={() => setForm((current) => ({
                    ...current,
                    tracks: current.tracks.filter((_, currentTrackIndex) => currentTrackIndex !== trackIndex),
                  }))}
                >
                  Remove track
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save supervisor profile"}</Button>
      </form>
    </section>
  );
}

function toForm(profile: FinalProjectSupervisorProfile): UpsertFinalProjectSupervisorProfileInput {
  return {
    statement: profile.statement,
    capacity: profile.capacity,
    acceptingStudents: profile.acceptingStudents,
    isPublished: profile.isPublished,
    tracks: profile.tracks.map((track) => ({
      title: track.title,
      description: track.description,
      ideas: track.ideas.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        skills: idea.skills,
      })),
    })),
  };
}

function displayName(profile: FinalProjectSupervisorProfile): string {
  return [profile.lecturer.honorific, profile.lecturer.name].filter(Boolean).join(" ");
}
