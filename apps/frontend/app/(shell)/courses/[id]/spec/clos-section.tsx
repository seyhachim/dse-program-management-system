"use client";

import { useState } from "react";
import {
  Copy,
  Eye,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import {
  bloomStyle,
  capDomainStyle,
  withCodes,
  type CloForm,
} from "./clo-model";
import { ClosDashboard } from "./clo-dashboard";
import { CloWizardModal } from "./clos/clo-wizard-modal";
import type { ProgrammeAcademicConfig } from "@dse-pms/shared-types";
// Re-exported so the wizard can keep importing the CLO model from this section.
export {
  EMPTY_CLOS,
  toClosForm,
  toClosPayload,
  type CloForm,
} from "./clo-model";

type FilterKey =
  | "all"
  | "active"
  | "inactive"
  | "mapped"
  | "unmapped"
  | "cognitive"
  | "affective"
  | "psychomotor"
  | "unclassified";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All CLOs" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "mapped", label: "Mapped to PLOs" },
  { key: "unmapped", label: "Not mapped" },
  { key: "cognitive", label: "Cognitive (C)" },
  { key: "affective", label: "Affective (A)" },
  { key: "psychomotor", label: "Psychomotor (P)" },
  { key: "unclassified", label: "Unclassified" },
];

export function ClosSection({
  value,
  courseId,
  lastSavedAt,
  programme,
  onPersist,
}: {
  value: CloForm[];
  courseId: string;
  lastSavedAt: Date | null;
  programme: ProgrammeAcademicConfig | null;
  onPersist: (items: CloForm[]) => Promise<boolean>;
}) {
  const clos = withCodes(value);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; cloCode: string | null }>(
    {
      open: false,
      cloCode: null,
    },
  );

  const visible = clos.filter((c) => {
    const domain = capDomainStyle(c.level);
    if (filter === "active" && c.status !== "active") return false;
    if (filter === "inactive" && c.status !== "inactive") return false;
    if (filter === "mapped" && c.mappedPlos.length === 0) return false;
    if (filter === "unmapped" && c.mappedPlos.length > 0) return false;
    if (filter === "cognitive" && domain?.code !== "C") return false;
    if (filter === "affective" && domain?.code !== "A") return false;
    if (filter === "psychomotor" && domain?.code !== "P") return false;
    if (filter === "unclassified" && domain) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = `${c.code} ${c.description} ${c.level} ${
        bloomStyle(c.level).name
      } ${domain?.name ?? "unclassified"} ${c.mappedPlos.join(
        " ",
      )}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const openAdd = () => setModal({ open: true, cloCode: null });
  const openEdit = (code: string) => setModal({ open: true, cloCode: code });

  const duplicate = async (index: number) => {
    const src = clos[index];
    if (!src) return;

    const copy: CloForm = {
      ...src,
      id: globalThis.crypto.randomUUID(),
      code: "",
    };

    const next = withCodes([
      ...clos.slice(0, index + 1),
      copy,
      ...clos.slice(index + 1),
    ]);
    const duplicated = next[index + 1];
    const ok = await onPersist(next);

    setNotice(
      ok
        ? `${duplicated?.code ?? "CLO"} was created.`
        : "Could not duplicate the CLO.",
    );
  };

  const remove = (index: number) => {
    const src = clos[index];
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${src?.code}? This can't be undone.`)
    ) {
      return;
    }
    onPersist(withCodes(clos.filter((_, i) => i !== index)));
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Course Learning Outcomes (CLOs)
          </h2>
          <p className="text-sm text-muted-foreground">
            Define and manage the Course Learning Outcomes for this course.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSavedAt ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Last saved: {formatSaved(lastSavedAt)}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setNotice("Preview & PDF export are coming in a later phase.")
            }
          >
            <Eye className="mr-1.5 h-4 w-4" /> Preview CLOs
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Add CLO
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-medium hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <ClosDashboard clos={clos} />

      {/* Table */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Course Learning Outcomes (CLOs)
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search CLOs…"
                className="h-9 w-44 rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            <div className="relative">
              <ListFilter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterKey)}
                className="h-9 rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {clos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No learning outcomes yet.
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-1 text-sm font-medium text-accent-foreground hover:underline"
            >
              + Add your first CLO
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="w-8 py-2 pr-2">#</th>
                  <th className="py-2 pr-3">CLO Code</th>
                  <th className="py-2 pr-3">Course Learning Outcome</th>
                  <th className="py-2 pr-3">C/A/P Level</th>
                  <th className="py-2 pr-3">Level Description</th>
                  <th className="py-2 pr-3">Mapped PLOs</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No CLOs match your search.
                    </td>
                  </tr>
                ) : (
                  visible.map((clo) => {
                    const index = clos.indexOf(clo);
                    const bloom = clo.level ? bloomStyle(clo.level) : null;
                    const domain = capDomainStyle(clo.level);
                    return (
                      <tr
                        key={clo.code}
                        className="border-b border-border/70 align-top"
                      >
                        <td className="py-3 pr-2 text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-accent-foreground">
                          {clo.code}
                        </td>
                        <td className="max-w-[320px] py-3 pr-3 text-foreground">
                          {clo.description || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {domain ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${domain.chip}`}
                              title={`${domain.name}: ${bloom?.name ?? clo.level}`}
                            >
                              {clo.level}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-foreground">
                          {bloom && domain ? (
                            bloom.name
                          ) : (
                            <span className="text-muted-foreground">
                              Unclassified
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-foreground">
                          {clo.mappedPlos.length ? (
                            clo.mappedPlos.join(", ")
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="py-3 pr-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor:
                                  clo.status === "active"
                                    ? "#22c55e"
                                    : "var(--muted-foreground)",
                              }}
                            />
                            <span className="text-foreground">
                              {clo.status === "active" ? "Active" : "Inactive"}
                            </span>
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconButton
                              label={`Edit ${clo.code}`}
                              onClick={() => openEdit(clo.code)}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label={`Duplicate ${clo.code}`}
                              onClick={() => duplicate(index)}
                            >
                              <Copy className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label={`Delete ${clo.code}`}
                              danger
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {clos.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {visible.length} of {clos.length} CLO
            {clos.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      <CloWizardModal
        open={modal.open}
        onOpenChange={(open) => setModal((m) => ({ ...m, open }))}
        courseId={courseId}
        cloCode={modal.cloCode}
        clos={clos}
        programme={programme}
        onPersist={onPersist}
      />
    </div>
  );
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted ${
        danger
          ? "text-status-live hover:border-status-live/40"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function formatSaved(d: Date): string {
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
