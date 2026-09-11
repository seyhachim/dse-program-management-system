"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Audience = "ALL_LECTURERS" | "ALL_STUDENTS" | "COHORT" | "CLASS_SECTION" | "CUSTOM";
type CreateAudience = Audience;
type ChatType = "GROUP" | "SUPERGROUP" | "CHANNEL";
type ManagedProgramme = { id: string };
type Destination = {
  id: string;
  programmeId: string;
  name: string;
  chatTitle?: string;
  chatType: ChatType;
  botKind: "PMS" | "PUBLIC_INFO";
  audienceType: Audience;
  scopeId?: string;
  purpose?: string;
  status: "PENDING" | "OBSERVED" | "CONNECTED" | "DISABLED";
  enabled: boolean;
  connected: boolean;
  verifiedAt?: string;
  updatedAt: string;
};
type Cohort = { id: string; code: string; name: string; intakeYear: number; status: string };
type Section = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  cohortId: string;
  cohortCode: string;
  cohortName: string;
  intakeYear: number;
};
type Registration = {
  id: string;
  observed: boolean;
  observedChatTitle?: string;
  observedChatType?: string;
  observedAt?: string;
};
type Delivery = {
  id: string;
  kind: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  lastError?: string;
  updatedAt: string;
};

const audienceLabels: Record<Audience, string> = {
  ALL_LECTURERS: "All lecturers",
  ALL_STUDENTS: "All students",
  COHORT: "Cohort",
  CLASS_SECTION: "Class / section",
  CUSTOM: "Custom operational group",
};
const createAudiences: CreateAudience[] = ["ALL_LECTURERS", "ALL_STUDENTS", "COHORT", "CLASS_SECTION", "CUSTOM"];
const chatTypeLabels: Record<ChatType, string> = {
  GROUP: "Group",
  SUPERGROUP: "Supergroup",
  CHANNEL: "Channel",
};

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong";
}

export function TelegramDestinationsClient() {
  const [programmes, setProgrammes] = useState<ManagedProgramme[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [audienceType, setAudienceType] = useState<CreateAudience>("ALL_LECTURERS");
  const [scopeId, setScopeId] = useState("");
  const [chatType, setChatType] = useState<ChatType>("SUPERGROUP");
  const [busyId, setBusyId] = useState<string>();
  const [connection, setConnection] = useState<{ destinationId: string; registrationId: string; command: string; expiresInSeconds: number }>();
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});

  useEffect(() => {
    void (async () => {
      try {
        const result = await api.get<{ programmes: ManagedProgramme[] }>("/api/telegram/destinations/scopes/programmes");
        setProgrammes(result.programmes);
        setSelectedProgrammeId((current) => current || result.programmes[0]?.id || "");
        if (result.programmes.length === 0) setLoading(false);
      } catch (err) {
        setError(messageOf(err));
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!selectedProgrammeId) return;
    setLoading(true);
    try {
      const query = `?programmeId=${encodeURIComponent(selectedProgrammeId)}`;
      const [destinationResult, cohortResult, sectionResult] = await Promise.all([
        api.get<{ destinations: Destination[] }>(`/api/telegram/destinations${query}`),
        api.get<{ cohorts: Cohort[] }>(`/api/telegram/destinations/scopes/cohorts${query}`),
        api.get<{ sections: Section[] }>(`/api/telegram/destinations/scopes/sections${query}`),
      ]);
      setDestinations(destinationResult.destinations);
      setCohorts(cohortResult.cohorts);
      setSections(sectionResult.sections);
      setScopeId("");
      setConnection(undefined);
      setCopiedCommand(false);
      setDeliveries({});
      setError(undefined);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProgrammeId]);

  useEffect(() => { void load(); }, [load]);

  async function createDestination(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (!selectedProgrammeId) {
      setError("Choose a programme before adding a Telegram destination.");
      return;
    }
    if ((audienceType === "COHORT" || audienceType === "CLASS_SECTION") && !scopeId) {
      setError(audienceType === "COHORT" ? "Choose a PMS cohort before adding this destination." : "Choose a canonical PMS section before adding this destination.");
      return;
    }
    try {
      const endpoint = audienceType === "CLASS_SECTION"
        ? "/api/telegram/destinations/class-section"
        : "/api/telegram/destinations";
      await api.post<Destination>(endpoint, {
        programmeId: selectedProgrammeId,
        name,
        audienceType,
        ...((audienceType === "COHORT" || audienceType === "CLASS_SECTION") ? { scopeId } : {}),
        purpose,
        chatType,
      });
      setName(""); setPurpose(""); setScopeId(""); setChatType("SUPERGROUP");
      await load();
    } catch (err) { setError(messageOf(err)); }
  }

  async function beginRegistration(destination: Destination) {
    setBusyId(destination.id); setError(undefined); setCopiedCommand(false);
    try {
      const result = await api.post<{ registrationId: string; command: string; expiresInSeconds: number }>(
        `/api/telegram/destinations/${destination.id}/registration`, {},
      );
      setConnection({ destinationId: destination.id, ...result });
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function copyRegistrationCommand() {
    if (!connection) return;
    setError(undefined);
    try {
      await navigator.clipboard.writeText(connection.command);
      setCopiedCommand(true);
    } catch {
      setCopiedCommand(false);
      setError("Could not copy the registration command automatically. Select the command and copy it manually.");
    }
  }

  async function checkAndConfirm(destination: Destination) {
    setBusyId(destination.id); setError(undefined);
    try {
      const registration = await api.get<Registration | null>(`/api/telegram/destinations/${destination.id}/registration`);
      if (!registration?.observed) {
        setError("The PMS bot has not seen an unconfirmed registration command in that Telegram chat yet.");
        return;
      }
      await api.post<Destination>(`/api/telegram/destinations/${destination.id}/confirm`, { registrationId: registration.id });
      setConnection(undefined);
      setCopiedCommand(false);
      await load();
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function editDestination(destination: Destination) {
    const nextName = window.prompt("Destination name", destination.name);
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      setError("Destination name cannot be empty.");
      return;
    }
    const nextPurpose = window.prompt("Purpose / description", destination.purpose ?? "");
    if (nextPurpose === null) return;

    setBusyId(destination.id); setError(undefined);
    try {
      await api.patch<Destination>(`/api/telegram/destinations/${destination.id}`, {
        name: trimmedName,
        purpose: nextPurpose.trim(),
      });
      await load();
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function deleteDestination(destination: Destination) {
    if (!window.confirm(`Delete the unused pending destination “${destination.name}”? This cannot be undone.`)) return;
    setBusyId(destination.id); setError(undefined);
    try {
      await api.delete<{ id: string; deleted: true }>(`/api/telegram/destinations/${destination.id}`);
      if (connection?.destinationId === destination.id) {
        setConnection(undefined);
        setCopiedCommand(false);
      }
      await load();
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function toggle(destination: Destination) {
    setBusyId(destination.id); setError(undefined);
    try {
      await api.patch<Destination>(`/api/telegram/destinations/${destination.id}`, { enabled: !destination.enabled });
      await load();
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function sendTest(destination: Destination) {
    setBusyId(destination.id); setError(undefined);
    try {
      await api.post(`/api/telegram/destinations/${destination.id}/test`, {});
      await showDeliveries(destination);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function showDeliveries(destination: Destination) {
    try {
      const result = await api.get<{ deliveries: Delivery[] }>(`/api/telegram/destinations/${destination.id}/deliveries`);
      setDeliveries((current) => ({ ...current, [destination.id]: result.deliveries }));
    } catch (err) { setError(messageOf(err)); }
  }

  const cohortName = (cohortId?: string) => {
    if (!cohortId) return undefined;
    const cohort = cohorts.find((item) => item.id === cohortId);
    return cohort ? `${cohort.code} · ${cohort.name}` : "PMS cohort";
  };

  const sectionName = (sectionId?: string) => {
    if (!sectionId) return undefined;
    const section = sections.find((item) => item.id === sectionId);
    return section ? `${section.cohortCode} / ${section.code} · ${section.name}` : "PMS section";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Add Telegram destination</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use semantic audiences so feature code never stores Telegram chat IDs.</p>
        <form onSubmit={createDestination} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Programme
            <select required value={selectedProgrammeId} onChange={(e) => setSelectedProgrammeId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3">
              {programmes.map((programme) => <option key={programme.id} value={programme.id}>{programme.id}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Only programmes you are authorized to manage are listed.</span>
          </label>
          <label className="grid gap-1 text-sm">Name
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3" placeholder="DSE Lecturers" />
          </label>
          <label className="grid gap-1 text-sm">Audience
            <select value={audienceType} onChange={(e) => { setAudienceType(e.target.value as CreateAudience); setScopeId(""); }} className="h-10 rounded-md border border-input bg-background px-3">
              {createAudiences.map((value) => <option key={value} value={value}>{audienceLabels[value]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Telegram chat type
            <select value={chatType} onChange={(e) => setChatType(e.target.value as ChatType)} className="h-10 rounded-md border border-input bg-background px-3">
              {(Object.keys(chatTypeLabels) as ChatType[]).map((value) => <option key={value} value={value}>{chatTypeLabels[value]}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Choose the type Telegram reports for the target chat. A mismatch is rejected rather than silently connected.</span>
          </label>
          {audienceType === "COHORT" && <label className="grid gap-1 text-sm">PMS cohort
            <select required value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3">
              <option value="">Choose cohort…</option>
              {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code} · {cohort.name} · Intake {cohort.intakeYear}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Uses the canonical PMS cohort record. Telegram does not create or own cohort membership.</span>
          </label>}
          {audienceType === "CLASS_SECTION" && <label className="grid gap-1 text-sm">PMS section
            <select required value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3">
              <option value="">Choose section…</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.cohortCode} · {section.cohortName} / {section.code} · {section.name}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Uses a canonical active section from Student Cohorts. Telegram membership never defines the section.</span>
          </label>}
          <label className="grid gap-1 text-sm">Purpose
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3" placeholder="Staff operations and open teaching slots" />
          </label>
          <div className="md:col-span-2">
            <button disabled={!selectedProgrammeId} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Add destination</button>
          </div>
        </form>
      </section>

      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {connection && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-semibold">Connect the PMS bot</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Add the authenticated DSE PMS Bot to the target group, supergroup, or channel.</li>
            <li>Send the one-time command below in that Telegram chat within {Math.round(connection.expiresInSeconds / 60)} minutes.</li>
            <li>Return here and choose <strong>Check & confirm</strong>. Observation alone never grants PMS access.</li>
          </ol>
          <div className="mt-3 flex items-stretch gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background p-3 text-sm">{connection.command}</code>
            <button type="button" onClick={() => void copyRegistrationCommand()} className="rounded-md border border-input bg-background px-3 text-sm font-medium">
              {copiedCommand ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Destinations</h2><p className="text-sm text-muted-foreground">Telegram membership is delivery routing only, never PMS authorization.</p></div>
          <button onClick={() => void load()} disabled={!selectedProgrammeId} className="rounded-md border border-input px-3 py-2 text-sm disabled:opacity-50">Refresh</button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading destinations…</p> : destinations.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No Telegram destinations yet for this programme.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {destinations.map((destination) => (
              <article key={destination.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="font-semibold">{destination.name}</h3><p className="mt-1 text-sm text-muted-foreground">{audienceLabels[destination.audienceType]}{destination.audienceType === "COHORT" ? ` · ${cohortName(destination.scopeId)}` : destination.audienceType === "CLASS_SECTION" ? ` · ${sectionName(destination.scopeId)}` : ""} · {destination.chatTitle ?? chatTypeLabels[destination.chatType]}</p></div>
                  <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{destination.status}</span>
                </div>
                {destination.purpose && <p className="mt-3 text-sm">{destination.purpose}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><dt>Bot</dt><dd className="font-medium text-foreground">DSE PMS Bot</dd></div>
                  <div><dt>Type</dt><dd className="font-medium text-foreground">{chatTypeLabels[destination.chatType]}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!destination.connected && <button disabled={busyId === destination.id} onClick={() => void beginRegistration(destination)} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{destination.status === "OBSERVED" ? "Reconnect" : "Connect"}</button>}
                  {!destination.connected && <button disabled={busyId === destination.id} onClick={() => void checkAndConfirm(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Check & confirm</button>}
                  {destination.connected && <button disabled={busyId === destination.id} onClick={() => void sendTest(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Test message</button>}
                  <button disabled={busyId === destination.id} onClick={() => void editDestination(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Edit</button>
                  <button disabled={busyId === destination.id} onClick={() => void toggle(destination)} className="rounded-md border border-input px-3 py-2 text-sm">{destination.enabled ? "Disable" : "Enable"}</button>
                  {destination.status === "PENDING" && !destination.verifiedAt && (
                    <button disabled={busyId === destination.id} onClick={() => void deleteDestination(destination)} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">Delete</button>
                  )}
                  <button onClick={() => void showDeliveries(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Deliveries</button>
                </div>
                {deliveries[destination.id] && <div className="mt-4 border-t pt-3"><h4 className="text-sm font-medium">Recent deliveries</h4><div className="mt-2 space-y-2">{deliveries[destination.id]!.length === 0 ? <p className="text-xs text-muted-foreground">No deliveries yet.</p> : deliveries[destination.id]!.slice(0, 5).map((delivery) => <div key={delivery.id} className="flex justify-between gap-3 text-xs"><span>{delivery.kind} · {new Date(delivery.updatedAt).toLocaleString()}</span><span className={delivery.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{delivery.status}{delivery.status === "failed" ? ` · ${delivery.lastError ?? "retry available"}` : ""}</span></div>)}</div></div>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}