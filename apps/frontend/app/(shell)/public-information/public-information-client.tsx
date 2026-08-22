"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import {
  ProgrammeFaqCategorySchema,
  ProgrammeImportantDateKindSchema,
  type ProgrammeFaqAdminWrite,
  type ProgrammeFaqCategory,
  type ProgrammeFaqRecord,
  type ProgrammeImportantDateAdminWrite,
  type ProgrammeImportantDateKind,
  type ProgrammeImportantDateRecord,
  type ProgrammePublicInfoOverview,
  type ProgrammePublicProfileAdminWrite,
  type ProgrammePublicProfileRecord,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { publicProgrammeInfoApi } from "@/lib/public-programme-info";

const PROGRAMME_ID = "dse";

type Tab =
  "overview" | "faqs" | "admission" | "fees" | "dates" | "contacts" | "bot";

type FaqDraft = {
  category: ProgrammeFaqCategory;
  slug: string;
  question: string;
  answer: string;
  shortAnswer: string;
  keywords: string;
  questionKm: string;
  answerKm: string;
  shortAnswerKm: string;
  keywordsKm: string;
  sortOrder: string;
  isFeatured: boolean;
  sourceLabel: string;
  sourceUrl: string;
  reviewedAt: string;
};

type ImportantDateDraft = {
  kind: ProgrammeImportantDateKind;
  title: string;
  description: string;
  titleKm: string;
  descriptionKm: string;
  date: string;
  endDate: string;
  sortOrder: string;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "faqs", label: "FAQs" },
  { id: "admission", label: "Admission" },
  { id: "fees", label: "Fees & Scholarships" },
  { id: "dates", label: "Important Dates" },
  { id: "contacts", label: "Contacts" },
  { id: "bot", label: "Bot Settings" },
];

const categoryLabels: Record<ProgrammeFaqCategory, string> = {
  About: "About DSE",
  Admission: "Admission",
  Curriculum: "Curriculum",
  Careers: "Careers",
  FeesScholarships: "Fees & Scholarships",
  StudentLife: "Student Life",
  Facilities: "Labs & Facilities",
  Lecturers: "Lecturers",
  ImportantDates: "Important Dates",
  Contact: "Contact",
};

const dateKindLabels: Record<ProgrammeImportantDateKind, string> = {
  ApplicationOpen: "Application opens",
  ApplicationDeadline: "Application deadline",
  EntranceExam: "Entrance exam",
  Interview: "Interview",
  ResultsAnnouncement: "Results announcement",
  Registration: "Registration",
  SemesterStart: "Semester start",
  ScholarshipDeadline: "Scholarship deadline",
  Other: "Other",
};

function blankFaq(category: ProgrammeFaqCategory = "About"): FaqDraft {
  return {
    category,
    slug: "",
    question: "",
    answer: "",
    shortAnswer: "",
    keywords: "",
    questionKm: "",
    answerKm: "",
    shortAnswerKm: "",
    keywordsKm: "",
    sortOrder: "0",
    isFeatured: false,
    sourceLabel: "",
    sourceUrl: "",
    reviewedAt: "",
  };
}

function faqToDraft(faq: ProgrammeFaqRecord): FaqDraft {
  return {
    category: faq.category,
    slug: faq.slug,
    question: faq.question,
    answer: faq.answer,
    shortAnswer: faq.shortAnswer ?? "",
    keywords: faq.keywords.join(", "),
    questionKm: faq.questionKm ?? "",
    answerKm: faq.answerKm ?? "",
    shortAnswerKm: faq.shortAnswerKm ?? "",
    keywordsKm: faq.keywordsKm?.join(", ") ?? "",
    sortOrder: String(faq.sortOrder),
    isFeatured: faq.isFeatured,
    sourceLabel: faq.sourceLabel ?? "",
    sourceUrl: faq.sourceUrl ?? "",
    reviewedAt: faq.reviewedAt ? String(faq.reviewedAt).slice(0, 10) : "",
  };
}

function faqPayload(draft: FaqDraft): ProgrammeFaqAdminWrite {
  return {
    category: draft.category,
    slug: draft.slug.trim(),
    question: draft.question.trim(),
    answer: draft.answer.trim(),
    shortAnswer: draft.shortAnswer.trim() || null,
    keywords: draft.keywords
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    questionKm: draft.questionKm.trim() || null,
    answerKm: draft.answerKm.trim() || null,
    shortAnswerKm: draft.shortAnswerKm.trim() || null,
    keywordsKm: draft.keywordsKm
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    sortOrder: Number(draft.sortOrder) || 0,
    isFeatured: draft.isFeatured,
    sourceLabel: draft.sourceLabel.trim() || null,
    sourceUrl: draft.sourceUrl.trim() || null,
    reviewedAt: draft.reviewedAt
      ? new Date(`${draft.reviewedAt}T00:00:00.000Z`)
      : null,
  };
}

function blankDate(): ImportantDateDraft {
  return {
    kind: "ApplicationDeadline",
    title: "",
    description: "",
    titleKm: "",
    descriptionKm: "",
    date: "",
    endDate: "",
    sortOrder: "0",
  };
}

function importantDateToDraft(
  item: ProgrammeImportantDateRecord,
): ImportantDateDraft {
  return {
    kind: item.kind,
    title: item.title,
    description: item.description,
    titleKm: item.titleKm ?? "",
    descriptionKm: item.descriptionKm ?? "",
    date: item.date.slice(0, 10),
    endDate: item.endDate?.slice(0, 10) ?? "",
    sortOrder: String(item.sortOrder),
  };
}

function importantDatePayload(
  draft: ImportantDateDraft,
): ProgrammeImportantDateAdminWrite {
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    description: draft.description.trim(),
    titleKm: draft.titleKm.trim() || null,
    descriptionKm: draft.descriptionKm.trim() || null,
    date: new Date(`${draft.date}T00:00:00.000Z`),
    endDate: draft.endDate ? new Date(`${draft.endDate}T00:00:00.000Z`) : null,
    sortOrder: Number(draft.sortOrder) || 0,
  };
}

function blankProfile(): ProgrammePublicProfileAdminWrite {
  return {
    programmeName: "Bachelor of Engineering in Data Science and Engineering",
    shortName: "DSE",
    overview: "",
    programmeNameKm: null,
    shortNameKm: null,
    overviewKm: null,
    admissionEmail: null,
    phone: null,
    websiteUrl: null,
    facebookUrl: null,
    campusAddress: null,
    campusAddressKm: null,
    mapUrl: null,
    applicationUrl: null,
  };
}

function profileDraft(
  profile: ProgrammePublicProfileRecord | null,
): ProgrammePublicProfileAdminWrite {
  if (!profile) return blankProfile();
  return {
    programmeName: profile.programmeName,
    shortName: profile.shortName,
    overview: profile.overview,
    programmeNameKm: profile.programmeNameKm,
    shortNameKm: profile.shortNameKm,
    overviewKm: profile.overviewKm,
    admissionEmail: profile.admissionEmail,
    phone: profile.phone,
    websiteUrl: profile.websiteUrl,
    facebookUrl: profile.facebookUrl,
    campusAddress: profile.campusAddress,
    campusAddressKm: profile.campusAddressKm,
    mapUrl: profile.mapUrl,
    applicationUrl: profile.applicationUrl,
  };
}

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function statusBadge(status: "Draft" | "Published") {
  return status === "Published"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function PublicInformationClient() {
  const { me } = useMe();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<ProgrammePublicInfoOverview | null>(
    null,
  );
  const [faqs, setFaqs] = useState<ProgrammeFaqRecord[]>([]);
  const [dates, setDates] = useState<ProgrammeImportantDateRecord[]>([]);
  const [profile, setProfile] = useState<ProgrammePublicProfileRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [faqOpen, setFaqOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<ProgrammeFaqRecord | null>(null);
  const [faqDraft, setFaqDraft] = useState<FaqDraft>(() => blankFaq());
  const [faqSaving, setFaqSaving] = useState(false);
  const [faqError, setFaqError] = useState<string | null>(null);
  const [previewFaq, setPreviewFaq] = useState<ProgrammeFaqRecord | null>(null);

  const [dateOpen, setDateOpen] = useState(false);
  const [editingDate, setEditingDate] =
    useState<ProgrammeImportantDateRecord | null>(null);
  const [dateDraft, setDateDraft] = useState<ImportantDateDraft>(blankDate);
  const [dateSaving, setDateSaving] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [profileForm, setProfileForm] =
    useState<ProgrammePublicProfileAdminWrite>(blankProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const canWrite = me?.permissions.includes("programme:write") ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextFaqs, nextDates, nextProfile] =
        await Promise.all([
          publicProgrammeInfoApi.overview(PROGRAMME_ID),
          publicProgrammeInfoApi.listFaqs(PROGRAMME_ID),
          publicProgrammeInfoApi.listImportantDates(PROGRAMME_ID),
          publicProgrammeInfoApi.getProfile(PROGRAMME_ID),
        ]);
      setOverview(nextOverview);
      setFaqs(nextFaqs);
      setDates(nextDates);
      setProfile(nextProfile);
      setProfileForm(profileDraft(nextProfile));
    } catch (err) {
      setError(message(err, "Failed to load public programme information"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredFaqs = useMemo(() => {
    if (tab === "admission")
      return faqs.filter((faq) => faq.category === "Admission");
    if (tab === "fees")
      return faqs.filter((faq) => faq.category === "FeesScholarships");
    return faqs;
  }, [faqs, tab]);

  const openFaqCreate = () => {
    const category =
      tab === "admission"
        ? "Admission"
        : tab === "fees"
          ? "FeesScholarships"
          : "About";
    setEditingFaq(null);
    setFaqDraft(blankFaq(category));
    setFaqError(null);
    setFaqOpen(true);
  };

  const openFaqEdit = (faq: ProgrammeFaqRecord) => {
    setEditingFaq(faq);
    setFaqDraft(faqToDraft(faq));
    setFaqError(null);
    setFaqOpen(true);
  };

  const saveFaq = async () => {
    setFaqSaving(true);
    setFaqError(null);
    try {
      const payload = faqPayload(faqDraft);
      if (editingFaq)
        await publicProgrammeInfoApi.updateFaq(
          PROGRAMME_ID,
          editingFaq.id,
          payload,
        );
      else await publicProgrammeInfoApi.createFaq(PROGRAMME_ID, payload);
      setFaqOpen(false);
      await load();
    } catch (err) {
      setFaqError(message(err, "Failed to save FAQ"));
    } finally {
      setFaqSaving(false);
    }
  };

  const setFaqPublication = async (
    faq: ProgrammeFaqRecord,
    publish: boolean,
  ) => {
    const verb = publish ? "Publish" : "Unpublish";
    if (!window.confirm(`${verb} “${faq.question}”?`)) return;
    try {
      if (publish)
        await publicProgrammeInfoApi.publishFaq(PROGRAMME_ID, faq.id);
      else await publicProgrammeInfoApi.unpublishFaq(PROGRAMME_ID, faq.id);
      await load();
    } catch (err) {
      setError(message(err, `Failed to ${verb.toLowerCase()} FAQ`));
    }
  };

  const removeFaq = async (faq: ProgrammeFaqRecord) => {
    if (!window.confirm(`Delete draft FAQ “${faq.question}”?`)) return;
    try {
      await publicProgrammeInfoApi.removeFaq(PROGRAMME_ID, faq.id);
      await load();
    } catch (err) {
      setError(message(err, "Failed to delete FAQ"));
    }
  };

  const openDateCreate = () => {
    setEditingDate(null);
    setDateDraft(blankDate());
    setDateError(null);
    setDateOpen(true);
  };

  const openDateEdit = (item: ProgrammeImportantDateRecord) => {
    setEditingDate(item);
    setDateDraft(importantDateToDraft(item));
    setDateError(null);
    setDateOpen(true);
  };

  const saveDate = async () => {
    if (!dateDraft.date) {
      setDateError("Date is required");
      return;
    }
    setDateSaving(true);
    setDateError(null);
    try {
      const payload = importantDatePayload(dateDraft);
      if (editingDate) {
        await publicProgrammeInfoApi.updateImportantDate(
          PROGRAMME_ID,
          editingDate.id,
          payload,
        );
      } else {
        await publicProgrammeInfoApi.createImportantDate(PROGRAMME_ID, payload);
      }
      setDateOpen(false);
      await load();
    } catch (err) {
      setDateError(message(err, "Failed to save important date"));
    } finally {
      setDateSaving(false);
    }
  };

  const setDatePublication = async (
    item: ProgrammeImportantDateRecord,
    publish: boolean,
  ) => {
    const verb = publish ? "Publish" : "Unpublish";
    if (!window.confirm(`${verb} “${item.title}”?`)) return;
    try {
      if (publish)
        await publicProgrammeInfoApi.publishImportantDate(
          PROGRAMME_ID,
          item.id,
        );
      else
        await publicProgrammeInfoApi.unpublishImportantDate(
          PROGRAMME_ID,
          item.id,
        );
      await load();
    } catch (err) {
      setError(message(err, `Failed to ${verb.toLowerCase()} important date`));
    }
  };

  const removeDate = async (item: ProgrammeImportantDateRecord) => {
    if (!window.confirm(`Delete draft date “${item.title}”?`)) return;
    try {
      await publicProgrammeInfoApi.removeImportantDate(PROGRAMME_ID, item.id);
      await load();
    } catch (err) {
      setError(message(err, "Failed to delete important date"));
    }
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const saved = await publicProgrammeInfoApi.saveProfile(
        PROGRAMME_ID,
        profileForm,
      );
      setProfile(saved);
      setProfileForm(profileDraft(saved));
      setProfileMessage("Public programme and contact information saved.");
      await load();
    } catch (err) {
      setProfileMessage(
        message(err, "Failed to save public programme profile"),
      );
    } finally {
      setProfileSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Loading public information…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="font-semibold text-foreground">
              PMS-owned public programme content
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Draft content stays internal. Publish only confirmed DSE
              information; Telegram and future public channels consume the
              published PMS source rather than owning separate copies.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Programme: <span className="font-medium text-foreground">DSE</span>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto border-b border-border">
        <div className="flex min-w-max gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === item.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {tab === "overview" ? (
        <OverviewPanel overview={overview} profile={profile} />
      ) : null}

      {tab === "faqs" || tab === "admission" || tab === "fees" ? (
        <FaqPanel
          faqs={filteredFaqs}
          canWrite={canWrite}
          title={
            tab === "admission"
              ? "Admission FAQs"
              : tab === "fees"
                ? "Fees & Scholarship FAQs"
                : "Public FAQs"
          }
          onCreate={openFaqCreate}
          onEdit={openFaqEdit}
          onPreview={setPreviewFaq}
          onPublish={(faq) => void setFaqPublication(faq, true)}
          onUnpublish={(faq) => void setFaqPublication(faq, false)}
          onDelete={(faq) => void removeFaq(faq)}
        />
      ) : null}

      {tab === "dates" ? (
        <ImportantDatesPanel
          dates={dates}
          canWrite={canWrite}
          onCreate={openDateCreate}
          onEdit={openDateEdit}
          onPublish={(item) => void setDatePublication(item, true)}
          onUnpublish={(item) => void setDatePublication(item, false)}
          onDelete={(item) => void removeDate(item)}
        />
      ) : null}

      {tab === "contacts" ? (
        <ProfilePanel
          form={profileForm}
          setForm={setProfileForm}
          canWrite={canWrite}
          saving={profileSaving}
          feedback={profileMessage}
          onSave={() => void saveProfile()}
        />
      ) : null}

      {tab === "bot" ? <BotSettingsPanel /> : null}

      <Dialog
        open={faqOpen}
        onOpenChange={(open) => {
          if (!faqSaving) setFaqOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingFaq ? "Edit public FAQ" : "Create public FAQ"}
            </DialogTitle>
            <DialogDescription>
              Save content as a draft first. Publishing is a separate explicit
              action.
            </DialogDescription>
          </DialogHeader>
          <FaqEditor draft={faqDraft} setDraft={setFaqDraft} />
          {faqError ? (
            <p className="text-sm text-destructive">{faqError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setFaqOpen(false)}
              disabled={faqSaving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveFaq()} disabled={faqSaving}>
              {faqSaving ? "Saving…" : "Save draft/content"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewFaq)}
        onOpenChange={(open) => {
          if (!open) setPreviewFaq(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>FAQ preview</DialogTitle>
            <DialogDescription>
              Preview the public answer before publishing or updating it.
            </DialogDescription>
          </DialogHeader>
          {previewFaq ? (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {categoryLabels[previewFaq.category]}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {previewFaq.question}
                </h3>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {previewFaq.answer}
              </p>
              {previewFaq.sourceLabel ? (
                <p className="text-xs text-muted-foreground">
                  Source: {previewFaq.sourceLabel}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dateOpen}
        onOpenChange={(open) => {
          if (!dateSaving) setDateOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingDate ? "Edit important date" : "Add important date"}
            </DialogTitle>
            <DialogDescription>
              Dates remain internal until explicitly published.
            </DialogDescription>
          </DialogHeader>
          <ImportantDateEditor draft={dateDraft} setDraft={setDateDraft} />
          {dateError ? (
            <p className="text-sm text-destructive">{dateError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDateOpen(false)}
              disabled={dateSaving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveDate()} disabled={dateSaving}>
              {dateSaving ? "Saving…" : "Save date"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverviewPanel({
  overview,
  profile,
}: {
  overview: ProgrammePublicInfoOverview | null;
  profile: ProgrammePublicProfileRecord | null;
}) {
  const cards = [
    [
      "Published FAQs",
      overview?.faqPublished ?? 0,
      `${overview?.faqDraft ?? 0} draft`,
    ],
    [
      "Important dates",
      overview?.importantDatePublished ?? 0,
      `${overview?.importantDateDraft ?? 0} draft`,
    ],
    [
      "Public profile",
      profile ? "Ready" : "Missing",
      profile
        ? "Contact details configured"
        : "Complete Contacts before launch",
    ],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map(([label, value, detail]) => (
        <section
          key={label}
          className="rounded-xl border border-border bg-card p-5"
        >
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </section>
      ))}
    </div>
  );
}

function FaqPanel({
  faqs,
  canWrite,
  title,
  onCreate,
  onEdit,
  onPreview,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  faqs: ProgrammeFaqRecord[];
  canWrite: boolean;
  title: string;
  onCreate: () => void;
  onEdit: (faq: ProgrammeFaqRecord) => void;
  onPreview: (faq: ProgrammeFaqRecord) => void;
  onPublish: (faq: ProgrammeFaqRecord) => void;
  onUnpublish: (faq: ProgrammeFaqRecord) => void;
  onDelete: (faq: ProgrammeFaqRecord) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border p-4">
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">
            Manage approved answers, search keywords, ordering, and publication
            state.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4" />
            New FAQ
          </Button>
        ) : null}
      </div>
      {faqs.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No FAQs in this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Keywords</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {faqs.map((faq) => (
                <tr key={faq.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="font-medium text-foreground">
                      {faq.question}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      /{faq.slug} · order {faq.sortOrder}
                      {faq.isFeatured ? " · Featured" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {categoryLabels[faq.category]}
                  </td>
                  <td className="max-w-64 px-4 py-4 text-xs text-muted-foreground">
                    {faq.keywords.length ? faq.keywords.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(faq.status)}`}
                    >
                      {faq.status}
                    </span>
                    {faq.publishedAt ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatDate(faq.publishedAt)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPreview(faq)}
                        aria-label={`Preview ${faq.question}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(faq)}
                          aria-label={`Edit ${faq.question}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canWrite && faq.status === "Draft" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPublish(faq)}
                        >
                          <Send className="h-4 w-4" />
                          Publish
                        </Button>
                      ) : null}
                      {canWrite && faq.status === "Published" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUnpublish(faq)}
                        >
                          <Undo2 className="h-4 w-4" />
                          Unpublish
                        </Button>
                      ) : null}
                      {canWrite && faq.status === "Draft" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(faq)}
                          aria-label={`Delete ${faq.question}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FaqEditor({
  draft,
  setDraft,
}: {
  draft: FaqDraft;
  setDraft: React.Dispatch<React.SetStateAction<FaqDraft>>;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="faq-category">Category</Label>
          <select
            id="faq-category"
            value={draft.category}
            onChange={(e) =>
              setDraft((v) => ({
                ...v,
                category: e.target.value as ProgrammeFaqCategory,
              }))
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ProgrammeFaqCategorySchema.options.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-slug">Slug</Label>
          <Input
            id="faq-slug"
            value={draft.slug}
            onChange={(e) => setDraft((v) => ({ ...v, slug: e.target.value }))}
            placeholder="admission-programming-experience"
          />
        </div>
      </div>
      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">
          English (required)
        </legend>
        <div className="space-y-2">
          <Label htmlFor="faq-question">Question</Label>
          <Input
            id="faq-question"
            value={draft.question}
            onChange={(e) =>
              setDraft((v) => ({ ...v, question: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-answer">Answer</Label>
          <textarea
            id="faq-answer"
            value={draft.answer}
            onChange={(e) =>
              setDraft((v) => ({ ...v, answer: e.target.value }))
            }
            className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-short">Short answer (optional)</Label>
          <textarea
            id="faq-short"
            value={draft.shortAnswer}
            onChange={(e) =>
              setDraft((v) => ({ ...v, shortAnswer: e.target.value }))
            }
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-keywords">Keywords (comma-separated)</Label>
          <Input
            id="faq-keywords"
            value={draft.keywords}
            onChange={(e) =>
              setDraft((v) => ({ ...v, keywords: e.target.value }))
            }
            placeholder="python, programming, beginner"
          />
        </div>
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">
          ខ្មែរ / Khmer (optional · falls back to English)
        </legend>
        <div className="space-y-2">
          <Label htmlFor="faq-question-km">សំណួរ / Question (Khmer)</Label>
          <Input
            id="faq-question-km"
            lang="km"
            value={draft.questionKm}
            onChange={(e) =>
              setDraft((v) => ({ ...v, questionKm: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-answer-km">ចម្លើយ / Answer (Khmer)</Label>
          <textarea
            id="faq-answer-km"
            lang="km"
            value={draft.answerKm}
            onChange={(e) =>
              setDraft((v) => ({ ...v, answerKm: e.target.value }))
            }
            className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-short-km">
            ចម្លើយខ្លី / Short answer (Khmer)
          </Label>
          <textarea
            id="faq-short-km"
            lang="km"
            value={draft.shortAnswerKm}
            onChange={(e) =>
              setDraft((v) => ({ ...v, shortAnswerKm: e.target.value }))
            }
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-keywords-km">
            ពាក្យគន្លឹះ / Keywords (Khmer, comma-separated)
          </Label>
          <Input
            id="faq-keywords-km"
            lang="km"
            value={draft.keywordsKm}
            onChange={(e) =>
              setDraft((v) => ({ ...v, keywordsKm: e.target.value }))
            }
          />
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="faq-order">Sort order</Label>
          <Input
            id="faq-order"
            type="number"
            min="0"
            value={draft.sortOrder}
            onChange={(e) =>
              setDraft((v) => ({ ...v, sortOrder: e.target.value }))
            }
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={draft.isFeatured}
              onChange={(e) =>
                setDraft((v) => ({ ...v, isFeatured: e.target.checked }))
              }
            />
            Feature this FAQ
          </label>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="faq-source-label">Source label</Label>
          <Input
            id="faq-source-label"
            value={draft.sourceLabel}
            onChange={(e) =>
              setDraft((v) => ({ ...v, sourceLabel: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-source-url">Source URL</Label>
          <Input
            id="faq-source-url"
            type="url"
            value={draft.sourceUrl}
            onChange={(e) =>
              setDraft((v) => ({ ...v, sourceUrl: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="faq-reviewed">Reviewed date</Label>
        <Input
          id="faq-reviewed"
          type="date"
          value={draft.reviewedAt}
          onChange={(e) =>
            setDraft((v) => ({ ...v, reviewedAt: e.target.value }))
          }
          className="sm:max-w-56"
        />
      </div>
    </div>
  );
}

function ImportantDatesPanel({
  dates,
  canWrite,
  onCreate,
  onEdit,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  dates: ProgrammeImportantDateRecord[];
  canWrite: boolean;
  onCreate: () => void;
  onEdit: (item: ProgrammeImportantDateRecord) => void;
  onPublish: (item: ProgrammeImportantDateRecord) => void;
  onUnpublish: (item: ProgrammeImportantDateRecord) => void;
  onDelete: (item: ProgrammeImportantDateRecord) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border p-4">
        <div>
          <h2 className="font-semibold text-foreground">Important Dates</h2>
          <p className="text-xs text-muted-foreground">
            Time-sensitive public dates are typed and published explicitly.
          </p>
        </div>
        {canWrite ? (
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Add date
          </Button>
        ) : null}
      </div>
      {dates.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No important dates configured.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {dates.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {item.title}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateKindLabels[item.kind]} · {formatDate(item.date)}
                  {item.endDate ? ` – ${formatDate(item.endDate)}` : ""}
                </p>
                {item.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {item.status === "Draft" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPublish(item)}
                    >
                      Publish
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUnpublish(item)}
                    >
                      Unpublish
                    </Button>
                  )}
                  {item.status === "Draft" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ImportantDateEditor({
  draft,
  setDraft,
}: {
  draft: ImportantDateDraft;
  setDraft: React.Dispatch<React.SetStateAction<ImportantDateDraft>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date-kind">Type</Label>
          <select
            id="date-kind"
            value={draft.kind}
            onChange={(e) =>
              setDraft((v) => ({
                ...v,
                kind: e.target.value as ProgrammeImportantDateKind,
              }))
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ProgrammeImportantDateKindSchema.options.map((kind) => (
              <option key={kind} value={kind}>
                {dateKindLabels[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-title">Title (English)</Label>
          <Input
            id="date-title"
            value={draft.title}
            onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="date-description">Description (English)</Label>
        <textarea
          id="date-description"
          value={draft.description}
          onChange={(e) =>
            setDraft((v) => ({ ...v, description: e.target.value }))
          }
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date-title-km">ចំណងជើង / Title (Khmer)</Label>
          <Input
            id="date-title-km"
            lang="km"
            value={draft.titleKm}
            onChange={(e) =>
              setDraft((v) => ({ ...v, titleKm: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-description-km">
            ការពិពណ៌នា / Description (Khmer)
          </Label>
          <textarea
            id="date-description-km"
            lang="km"
            value={draft.descriptionKm}
            onChange={(e) =>
              setDraft((v) => ({ ...v, descriptionKm: e.target.value }))
            }
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="date-start">Date</Label>
          <Input
            id="date-start"
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-end">End date</Label>
          <Input
            id="date-end"
            type="date"
            value={draft.endDate}
            onChange={(e) =>
              setDraft((v) => ({ ...v, endDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-order">Sort order</Label>
          <Input
            id="date-order"
            type="number"
            min="0"
            value={draft.sortOrder}
            onChange={(e) =>
              setDraft((v) => ({ ...v, sortOrder: e.target.value }))
            }
          />
        </div>
      </div>
    </div>
  );
}

function ProfilePanel({
  form,
  setForm,
  canWrite,
  saving,
  feedback,
  onSave,
}: {
  form: ProgrammePublicProfileAdminWrite;
  setForm: React.Dispatch<
    React.SetStateAction<ProgrammePublicProfileAdminWrite>
  >;
  canWrite: boolean;
  saving: boolean;
  feedback: string | null;
  onSave: () => void;
}) {
  const text = (key: keyof ProgrammePublicProfileAdminWrite) =>
    (form[key] as string | null | undefined) ?? "";
  const set = (key: keyof ProgrammePublicProfileAdminWrite, value: string) =>
    setForm((current) => ({ ...current, [key]: value.trim() ? value : null }));
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="max-w-3xl space-y-5">
        <div>
          <h2 className="font-semibold text-foreground">
            Programme & Contact Information
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shared by public channels. Keep only official contact details here.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Programme name</Label>
            <Input
              id="profile-name"
              value={text("programmeName")}
              onChange={(e) => set("programmeName", e.target.value)}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-short">Short name</Label>
            <Input
              id="profile-short"
              value={text("shortName")}
              onChange={(e) => set("shortName", e.target.value)}
              disabled={!canWrite}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-overview">Public overview (English)</Label>
          <textarea
            id="profile-overview"
            value={text("overview")}
            onChange={(e) => set("overview", e.target.value)}
            disabled={!canWrite}
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-sm font-semibold">
            ខ្មែរ / Khmer (optional · falls back to English)
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ឈ្មោះកម្មវិធី / Programme name"
              id="profile-name-km"
              value={text("programmeNameKm")}
              onChange={(v) => set("programmeNameKm", v)}
              disabled={!canWrite}
            />
            <Field
              label="ឈ្មោះខ្លី / Short name"
              id="profile-short-km"
              value={text("shortNameKm")}
              onChange={(v) => set("shortNameKm", v)}
              disabled={!canWrite}
            />
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="profile-overview-km">
              សេចក្ដីណែនាំ / Public overview
            </Label>
            <textarea
              id="profile-overview-km"
              lang="km"
              value={text("overviewKm")}
              onChange={(e) => set("overviewKm", e.target.value)}
              disabled={!canWrite}
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="profile-address-km">
              អាសយដ្ឋាន / Campus address
            </Label>
            <textarea
              id="profile-address-km"
              lang="km"
              value={text("campusAddressKm")}
              onChange={(e) => set("campusAddressKm", e.target.value)}
              disabled={!canWrite}
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Admissions email"
            id="profile-email"
            value={text("admissionEmail")}
            onChange={(v) => set("admissionEmail", v)}
            disabled={!canWrite}
            type="email"
          />
          <Field
            label="Phone"
            id="profile-phone"
            value={text("phone")}
            onChange={(v) => set("phone", v)}
            disabled={!canWrite}
          />
          <Field
            label="Website"
            id="profile-website"
            value={text("websiteUrl")}
            onChange={(v) => set("websiteUrl", v)}
            disabled={!canWrite}
            type="url"
          />
          <Field
            label="Facebook"
            id="profile-facebook"
            value={text("facebookUrl")}
            onChange={(v) => set("facebookUrl", v)}
            disabled={!canWrite}
            type="url"
          />
          <Field
            label="Application URL"
            id="profile-application"
            value={text("applicationUrl")}
            onChange={(v) => set("applicationUrl", v)}
            disabled={!canWrite}
            type="url"
          />
          <Field
            label="Map URL"
            id="profile-map"
            value={text("mapUrl")}
            onChange={(v) => set("mapUrl", v)}
            disabled={!canWrite}
            type="url"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-address">Campus address</Label>
          <textarea
            id="profile-address"
            value={text("campusAddress")}
            onChange={(e) => set("campusAddress", e.target.value)}
            disabled={!canWrite}
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {feedback ? (
          <p className="text-sm text-muted-foreground">{feedback}</p>
        ) : null}
        {canWrite ? (
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save public profile"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function BotSettingsPanel() {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="max-w-2xl">
        <h2 className="font-semibold text-foreground">Public Bot Settings</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The PMS is the source of truth. This release intentionally does not
          store Telegram-owned answers or duplicate programme content. Telegram
          menu configuration and webhook delivery are implemented in #487 and
          #488; they will consume the published content managed here.
        </p>
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Content readiness:</strong>{" "}
          publish FAQs and important dates, then complete the official contact
          profile. No bot redeployment is needed for normal content edits once
          the public read service is connected.
        </div>
      </div>
    </section>
  );
}
