"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type {
  ProgramCompetencyWithPlos,
  ProgramLearningOutcome,
  ProgramPolicy,
  ProgrammeAcademicConfig,
  ProgrammeProfile,
  UpdatePloTaxonomyInput,
} from "@dse-pms/shared-types";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

export function ProgrammeManagementClient() {
  const { me } = useMe();

  const canWrite = me?.permissions.includes("programme:write") ?? false;

  const [data, setData] = useState<ProgrammeAcademicConfig | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingCompetency, setEditingCompetency] =
    useState<ProgramCompetencyWithPlos | null>(null);

  const [selectedPloCodes, setSelectedPloCodes] = useState<Set<string>>(
    new Set(),
  );

  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  const [editingPlo, setEditingPlo] = useState<ProgramLearningOutcome | null>(
    null,
  );
  const [taxonomyDraft, setTaxonomyDraft] = useState<UpdatePloTaxonomyInput>({
    major: null,
    learningDomain: null,
    specificOrGeneric: null,
    cap: null,
  });
  const [savingTaxonomy, setSavingTaxonomy] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);

  const [policyDraft, setPolicyDraft] = useState<ProgramPolicy | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProgrammeProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySaved, setPolicySaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.get<ProgrammeAcademicConfig>("/api/programme");

      setData(result);
      setPolicyDraft(result.policy);
      setProfileDraft(result.profile);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load programme information",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openMappingDialog = (competency: ProgramCompetencyWithPlos) => {
    setEditingCompetency(competency);

    setSelectedPloCodes(new Set(competency.plos.map((plo) => plo.code)));

    setMappingError(null);
  };

  const closeMappingDialog = () => {
    if (savingMapping) return;

    setEditingCompetency(null);
    setSelectedPloCodes(new Set());
    setMappingError(null);
  };

  const togglePlo = (code: string, checked: boolean) => {
    setSelectedPloCodes((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }

      return next;
    });
  };

  const updatePolicy = (key: keyof ProgramPolicy, value: string) => {
    setPolicyDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setPolicySaved(false);
  };

  const updateProfileField = <K extends keyof ProgrammeProfile>(
    key: K,
    value: ProgrammeProfile[K],
  ) => {
    setProfileDraft((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setProfileSaved(false);
  };

  const updateProfileList = (
    key: "mission" | "goals",
    index: number,
    value: string,
  ) => {
    setProfileDraft((current) => {
      if (!current) return current;
      const next = [...current[key]];
      next[index] = value;
      return { ...current, [key]: next };
    });
    setProfileSaved(false);
  };

  const updateProfileStructuredList = (
    key: "educationalPhilosophy" | "peos",
    index: number,
    field: "code" | "title" | "description",
    value: string,
  ) => {
    setProfileDraft((current) => {
      if (!current) return current;
      const next = current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      );
      return { ...current, [key]: next };
    });
    setProfileSaved(false);
  };

  const saveProfile = async () => {
    if (!profileDraft) return;

    setSavingProfile(true);
    setProfileError(null);

    try {
      const updated = await api.put<ProgrammeProfile>(
        "/api/programme/profile",
        profileDraft,
      );
      setProfileDraft(updated);
      setData((current) =>
        current ? { ...current, profile: updated } : current,
      );
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(
        err instanceof ApiError
          ? err.message
          : "Failed to save programme profile",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const savePolicy = async () => {
    if (!policyDraft) return;

    setSavingPolicy(true);
    setPolicyError(null);

    try {
      const updated = await api.put<ProgramPolicy>(
        "/api/programme/policies",
        policyDraft,
      );

      setPolicyDraft(updated);
      setData((current) =>
        current ? { ...current, policy: updated } : current,
      );
      setPolicySaved(true);
      window.setTimeout(() => setPolicySaved(false), 2500);
    } catch (err) {
      setPolicyError(
        err instanceof ApiError
          ? err.message
          : "Failed to save programme policies",
      );
    } finally {
      setSavingPolicy(false);
    }
  };

  const saveMapping = async () => {
    if (!editingCompetency) return;

    setSavingMapping(true);
    setMappingError(null);

    try {
      const updated = await api.put<ProgramCompetencyWithPlos>(
        `/api/programme/competencies/${editingCompetency.code}/plos`,
        {
          ploCodes: [...selectedPloCodes],
        },
      );

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          competencies: current.competencies.map((competency) =>
            competency.id === updated.id ? updated : competency,
          ),
        };
      });

      setEditingCompetency(null);
      setSelectedPloCodes(new Set());
    } catch (err) {
      setMappingError(
        err instanceof ApiError ? err.message : "Failed to save PLO mapping",
      );
    } finally {
      setSavingMapping(false);
    }
  };

  const openTaxonomyDialog = (plo: ProgramLearningOutcome) => {
    setEditingPlo(plo);
    setTaxonomyDraft({
      major: plo.major,
      learningDomain: plo.learningDomain,
      specificOrGeneric: plo.specificOrGeneric,
      cap: plo.cap,
    });
    setTaxonomyError(null);
  };

  const closeTaxonomyDialog = () => {
    if (savingTaxonomy) return;

    setEditingPlo(null);
    setTaxonomyError(null);
  };

  const saveTaxonomy = async () => {
    if (!editingPlo) return;

    setSavingTaxonomy(true);
    setTaxonomyError(null);

    try {
      const updated = await api.put<ProgramLearningOutcome>(
        `/api/programme/plos/${editingPlo.code}`,
        taxonomyDraft,
      );

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          plos: current.plos.map((plo) =>
            plo.id === updated.id ? updated : plo,
          ),
        };
      });

      setEditingPlo(null);
    } catch (err) {
      setTaxonomyError(
        err instanceof ApiError ? err.message : "Failed to save classification",
      );
    } finally {
      setSavingTaxonomy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Loading programme information…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-3 text-sm text-status-upcoming">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No programme information available.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Programme
          </p>

          <h2 className="mt-2 text-xl font-semibold text-foreground">
            {data.title}
          </h2>

          <div className="mt-5 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">
                Programme Learning Outcomes
              </p>

              <p className="mt-1 text-lg font-semibold">{data.plos.length}</p>
            </div>

            <div>
              <p className="text-muted-foreground">Program Competencies</p>

              <p className="mt-1 text-lg font-semibold">
                {data.competencies.length}
              </p>
            </div>
          </div>
        </section>

        <Tabs defaultValue="plos">
          <TabsList>
            <TabsTrigger value="profile">Programme Overview</TabsTrigger>
            <TabsTrigger value="plos">Programme Learning Outcomes</TabsTrigger>

            <TabsTrigger value="competencies">Program Competencies</TabsTrigger>

            <TabsTrigger value="policies">Course Policies</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Programme Overview</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  These programme-level statements drive the required Course Specification Part 1 page. They are separate from course-level data.
                </p>
              </div>

              {profileError ? (
                <div className="mx-5 mt-4 rounded-lg border border-status-upcoming bg-status-upcoming-bg px-3 py-2 text-sm text-status-upcoming">
                  {profileError}
                </div>
              ) : null}

              {profileDraft ? (
                <div className="space-y-5 p-5">
                  <div>
                    <label className="text-sm font-semibold">Programme Vision</label>
                    <textarea
                      value={profileDraft.vision}
                      onChange={(event) => updateProfileField("vision", event.target.value)}
                      disabled={!canWrite || savingProfile}
                      rows={4}
                      className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    />
                  </div>

                  {[
                    ["mission", "Programme Mission"],
                    ["goals", "Programme Goals"],
                  ].map(([key, title]) => (
                    <div key={key} className="rounded-xl border border-border p-4">
                      <h4 className="text-sm font-semibold">{title}</h4>
                      <div className="mt-3 space-y-3">
                        {profileDraft[key as "mission" | "goals"].map((item, index) => (
                          <textarea
                            key={`${key}-${index}`}
                            value={item}
                            onChange={(event) => updateProfileList(key as "mission" | "goals", index, event.target.value)}
                            disabled={!canWrite || savingProfile}
                            rows={3}
                            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {[
                    ["educationalPhilosophy", "Programme Educational Philosophy"],
                    ["peos", "Programme Educational Objectives (PEOs)"],
                  ].map(([key, title]) => (
                    <div key={key} className="rounded-xl border border-border p-4">
                      <h4 className="text-sm font-semibold">{title}</h4>
                      <div className="mt-3 space-y-4">
                        {profileDraft[key as "educationalPhilosophy" | "peos"].map((item, index) => (
                          <div key={`${key}-${index}`} className="rounded-lg border border-border p-3">
                            <div className="grid gap-3 md:grid-cols-[90px_1fr]">
                              <input
                                value={item.code}
                                onChange={(event) => updateProfileStructuredList(key as "educationalPhilosophy" | "peos", index, "code", event.target.value)}
                                disabled={!canWrite || savingProfile}
                                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                              <input
                                value={item.title}
                                onChange={(event) => updateProfileStructuredList(key as "educationalPhilosophy" | "peos", index, "title", event.target.value)}
                                disabled={!canWrite || savingProfile}
                                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                            </div>
                            <textarea
                              value={item.description}
                              onChange={(event) => updateProfileStructuredList(key as "educationalPhilosophy" | "peos", index, "description", event.target.value)}
                              disabled={!canWrite || savingProfile}
                              rows={3}
                              className="mt-3 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-end gap-3 pt-1">
                    {profileSaved ? <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saved</span> : null}
                    {canWrite ? (
                      <Button onClick={saveProfile} disabled={savingProfile}>
                        {savingProfile ? "Saving…" : "Save Programme Overview"}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">Read-only. Programme profile changes require programme:write permission.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="plos" className="mt-4">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Programme Learning Outcomes</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Programme-level outcomes referenced by course learning
                  outcomes.
                </p>
              </div>

              <div className="divide-y divide-border">
                {data.plos.map((plo) => (
                  <div
                    key={plo.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[90px_1fr_auto]"
                  >
                    <div>
                      <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                        {plo.code}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm leading-6 text-foreground">
                        {plo.description}
                      </p>

                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex gap-1">
                          <dt className="font-medium">Major:</dt>
                          <dd>{plo.major ?? "—"}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="font-medium">Learning Domain:</dt>
                          <dd>{plo.learningDomain ?? "—"}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="font-medium">Specific/Generic:</dt>
                          <dd>{plo.specificOrGeneric ?? "—"}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="font-medium">C/A/P:</dt>
                          <dd>{plo.cap ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>

                    {canWrite ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openTaxonomyDialog(plo)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Classification
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="policies" className="mt-4">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Programme Course Policies</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Define the programme-level policy baseline that course
                  specifications display as read-only guidance. Course-specific
                  instructions remain separate from these rules.
                </p>
              </div>

              {policyError ? (
                <div className="mx-5 mt-4 rounded-lg border border-status-upcoming bg-status-upcoming-bg px-3 py-2 text-sm text-status-upcoming">
                  {policyError}
                </div>
              ) : null}

              {policyDraft ? (
                <div className="space-y-4 p-5">
                  {[
                    [
                      "attendancePreparation",
                      "Attendance & Preparation",
                      "Programme-wide expectations for attendance and preparation before class.",
                    ],
                    [
                      "academicIntegrity",
                      "Academic Integrity",
                      "Programme-wide expectations concerning plagiarism, cheating, authorship, and academic misconduct.",
                    ],
                    [
                      "assignmentsLateSubmission",
                      "Assignments & Late Submission",
                      "Programme-wide rules for assignment submission, deadlines, and late work.",
                    ],
                    [
                      "examinationRules",
                      "Examination Rules",
                      "Programme-wide examination and permitted-materials requirements.",
                    ],
                    [
                      "penaltiesConsequences",
                      "Penalties & Consequences",
                      "Programme-wide consequences and escalation rules.",
                    ],
                  ].map(([key, title, description]) => (
                    <div
                      key={key}
                      className="rounded-xl border border-border p-5"
                    >
                      <h4 className="text-sm font-semibold text-foreground">
                        {title}
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {description}
                      </p>
                      <textarea
                        value={policyDraft[key as keyof ProgramPolicy]}
                        onChange={(event) =>
                          updatePolicy(
                            key as keyof ProgramPolicy,
                            event.target.value,
                          )
                        }
                        disabled={!canWrite || savingPolicy}
                        rows={5}
                        className="mt-4 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder={`Enter the official programme policy for ${(title ?? "this policy").toLowerCase()}…`}
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    {policySaved ? (
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        Saved
                      </span>
                    ) : null}
                    {canWrite ? (
                      <Button onClick={savePolicy} disabled={savingPolicy}>
                        {savingPolicy ? "Saving…" : "Save Programme Policies"}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Read-only. Programme policy changes require
                        programme:write permission.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="competencies" className="mt-4">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h3 className="font-semibold">Program Competencies</h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Graduate competencies defined at programme level and aligned
                  with Programme Learning Outcomes.
                </p>
              </div>

              <div className="divide-y divide-border">
                {data.competencies.map((competency) => (
                  <div
                    key={competency.id}
                    className="grid gap-4 px-5 py-4 lg:grid-cols-[90px_1fr_auto]"
                  >
                    <div>
                      <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                        {competency.code}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {competency.name}
                      </p>

                      {competency.description ? (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {competency.description}
                        </p>
                      ) : null}

                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Mapped PLOs
                        </p>

                        {competency.plos.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {competency.plos.map((plo) => (
                              <span
                                key={plo.id}
                                title={plo.description}
                                className="inline-flex rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground"
                              >
                                {plo.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">
                            No PLO mapping
                          </p>
                        )}
                      </div>
                    </div>

                    {canWrite ? (
                      <div className="flex items-start">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMappingDialog(competency)}
                        >
                          Edit Mapping
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={editingCompetency !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeMappingDialog();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit PLO Mapping</DialogTitle>

            <DialogDescription>
              {editingCompetency
                ? `${editingCompetency.code} — ${editingCompetency.name}`
                : "Select the Programme Learning Outcomes associated with this competency."}
            </DialogDescription>
          </DialogHeader>

          {mappingError ? (
            <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-3 py-2 text-sm text-status-upcoming">
              {mappingError}
            </div>
          ) : null}

          <div className="space-y-2">
            {data.plos.map((plo) => {
              const checked = selectedPloCodes.has(plo.code);

              return (
                <label
                  key={plo.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      togglePlo(plo.code, Boolean(value))
                    }
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {plo.code}
                      </span>
                    </div>

                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {plo.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {selectedPloCodes.size} PLO
              {selectedPloCodes.size === 1 ? "" : "s"} selected
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={closeMappingDialog}
                disabled={savingMapping}
              >
                Cancel
              </Button>

              <Button onClick={saveMapping} disabled={savingMapping}>
                {savingMapping ? "Saving…" : "Save Mapping"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingPlo !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeTaxonomyDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Classification</DialogTitle>

            <DialogDescription>
              {editingPlo
                ? `${editingPlo.code} — cover page taxonomy classification`
                : "Set the cover page taxonomy classification for this PLO."}
            </DialogDescription>
          </DialogHeader>

          {taxonomyError ? (
            <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-3 py-2 text-sm text-status-upcoming">
              {taxonomyError}
            </div>
          ) : null}

          <div className="space-y-3">
            {(
              [
                ["major", "Major"],
                ["learningDomain", "Learning Domain"],
                ["specificOrGeneric", "Specific/Generic"],
                ["cap", "C/A/P"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`plo-taxonomy-${key}`}>{label}</Label>
                <Input
                  id={`plo-taxonomy-${key}`}
                  value={taxonomyDraft[key] ?? ""}
                  onChange={(event) =>
                    setTaxonomyDraft((current) => ({
                      ...current,
                      [key]: event.target.value || null,
                    }))
                  }
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={closeTaxonomyDialog}
              disabled={savingTaxonomy}
            >
              Cancel
            </Button>

            <Button onClick={saveTaxonomy} disabled={savingTaxonomy}>
              {savingTaxonomy ? "Saving…" : "Save Classification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
