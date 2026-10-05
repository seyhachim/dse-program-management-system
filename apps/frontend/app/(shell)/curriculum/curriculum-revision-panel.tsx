"use client";

import { useEffect, useState } from "react";
import {
  PROGRAMME_CURRICULUM_REVISION_TRIGGERS,
  type CurriculumVersionSummary,
  type ProgrammeCurriculumRead,
  type ProgrammeCurriculumRevisionTrigger,
  type ProgrammeCurriculumRevisionType,
} from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import {
  curriculumApi,
  curriculumVersionLabel,
  revisionTriggerLabel,
  type ProgrammeCurriculumListItem,
} from "@/lib/curriculum";
import {
  canCreateCurriculumRevision,
  isCurriculumRevisionReady,
  nextCurriculumRevisionVersion,
} from "./curriculum-revision-form";

export function CurriculumRevisionPanel({
  curriculum,
  predecessor,
  canWrite,
  busy,
  onBusyChange,
  onCreated,
}: {
  curriculum: ProgrammeCurriculumListItem;
  predecessor: CurriculumVersionSummary;
  canWrite: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCreated: (created: ProgrammeCurriculumRead) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [revisionType, setRevisionType] =
    useState<CurriculumRevisionKind>("Minor");
  const [revisionTriggers, setRevisionTriggers] = useState<
    ProgrammeCurriculumRevisionTrigger[]
  >([]);
  const [revisionReason, setRevisionReason] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setRevisionType("Minor");
    setRevisionTriggers([]);
    setRevisionReason("");
    setChangeSummary("");
    setError(null);
  }, [predecessor.id]);

  if (!canCreateCurriculumRevision(canWrite, predecessor.status)) {
    return null;
  }

  const minorVersion = nextCurriculumRevisionVersion(
    curriculum.versions,
    predecessor,
    "Minor",
  );
  const majorVersion = nextCurriculumRevisionVersion(
    curriculum.versions,
    predecessor,
    "Major",
  );
  const nextVersion =
    revisionType === "Minor" ? minorVersion : majorVersion;
  const ready = isCurriculumRevisionReady({
    revisionType,
    revisionTriggers,
    revisionReason,
    changeSummary,
  });

  const toggleTrigger = (
    trigger: ProgrammeCurriculumRevisionTrigger,
    checked: boolean,
  ) => {
    setRevisionTriggers((current) =>
      checked
        ? current.includes(trigger)
          ? current
          : [...current, trigger]
        : current.filter((item) => item !== trigger),
    );
  };

  const createRevision = async () => {
    if (!ready) return;
    onBusyChange(true);
    setError(null);
    try {
      const created = await curriculumApi.createRevision(
        curriculum.id,
        predecessor.id,
        {
          revisionType,
          revisionTriggers,
          revisionReason: revisionReason.trim(),
          changeSummary: changeSummary.trim(),
        },
      );
      await onCreated(created);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create curriculum revision",
      );
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Need to change this curriculum?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a new Draft revision. The{" "}
              {curriculumVersionLabel(predecessor)} {predecessor.status} snapshot
              remains unchanged.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(true)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Create revision
          </button>
        </div>
      ) : (
        <div
          className="space-y-4 rounded-lg border border-border bg-muted/20 p-4"
          aria-label="Create curriculum revision"
        >
          <div>
            <p className="text-sm font-semibold">Create Curriculum Revision</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Based on {curriculumVersionLabel(predecessor)} ·{" "}
              {predecessor.status}. The predecessor remains read-only and
              auditable.
            </p>
          </div>

          <label className="block text-sm font-medium">
            Revision type
            <select
              value={revisionType}
              onChange={(event) =>
                setRevisionType(
                  event.target.value as CurriculumRevisionKind,
                )
              }
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-sm"
            >
              <option value="Minor">Minor → v{minorVersion}</option>
              <option value="Major">Major → v{majorVersion}</option>
            </select>
          </label>

          <fieldset>
            <legend className="text-sm font-medium">Revision trigger</legend>
            <p className="mt-1 text-xs text-muted-foreground">
              Select at least one reason that initiated this revision.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PROGRAMME_CURRICULUM_REVISION_TRIGGERS.map((trigger) => (
                <label
                  key={trigger}
                  className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={revisionTriggers.includes(trigger)}
                    onChange={(event) =>
                      toggleTrigger(trigger, event.target.checked)
                    }
                  />
                  <span>{revisionTriggerLabel(trigger)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block text-sm font-medium">
              Revision reason
              <textarea
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Why is a new curriculum revision needed?"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Change summary
              <textarea
                value={changeSummary}
                onChange={(event) => setChangeSummary(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Summarize the intended changes in this Draft."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => void createRevision()}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Creating revision…" : `Create v${nextVersion} Draft`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            {!ready && (
              <p className="text-xs text-muted-foreground">
                Trigger, revision reason, and change summary are required.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
