"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Audience = "ALL_LECTURERS" | "ALL_STUDENTS" | "COHORT" | "CLASS_SECTION" | "CUSTOM";
type Destination = {
  id: string;
  name: string;
  chatTitle?: string;
  chatType: "GROUP" | "SUPERGROUP" | "CHANNEL";
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

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong";
}

export function TelegramDestinationsClient() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [audienceType, setAudienceType] = useState<Audience>("ALL_LECTURERS");
  const [scopeId, setScopeId] = useState("");
  const [busyId, setBusyId] = useState<string>();
  const [connection, setConnection] = useState<{ destinationId: string; registrationId: string; command: string; expiresInSeconds: number }>();
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ destinations: Destination[] }>("/api/telegram/destinations");
      setDestinations(result.destinations);
      setError(undefined);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createDestination(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await api.post<Destination>("/api/telegram/destinations", {
        name,
        audienceType,
        ...(audienceType === "COHORT" || audienceType === "CLASS_SECTION" ? { scopeId } : {}),
        purpose,
        chatType: "SUPERGROUP",
      });
      setName(""); setPurpose(""); setScopeId("");
      await load();
    } catch (err) { setError(messageOf(err)); }
  }

  async function beginRegistration(destination: Destination) {
    setBusyId(destination.id); setError(undefined);
    try {
      const result = await api.post<{ registrationId: string; command: string; expiresInSeconds: number }>(
        `/api/telegram/destinations/${destination.id}/registration`, {},
      );
      setConnection({ destinationId: destination.id, ...result });
    } catch (err) { setError(messageOf(err)); }
    finally { setBusyId(undefined); }
  }

  async function checkAndConfirm(destination: Destination) {
    setBusyId(destination.id); setError(undefined);
    try {
      const registration = await api.get<Registration | null>(`/api/telegram/destinations/${destination.id}/registration`);
      if (!registration?.observed) {
        setError("The PMS bot has not seen the registration command in that Telegram chat yet.");
        return;
      }
      await api.post<Destination>(`/api/telegram/destinations/${destination.id}/confirm`, { registrationId: registration.id });
      setConnection(undefined);
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

  const needsScope = audienceType === "COHORT" || audienceType === "CLASS_SECTION";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Add Telegram destination</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use semantic audiences so feature code never stores Telegram chat IDs.</p>
        <form onSubmit={createDestination} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Name
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3" placeholder="DSE Lecturers" />
          </label>
          <label className="grid gap-1 text-sm">Audience
            <select value={audienceType} onChange={(e) => setAudienceType(e.target.value as Audience)} className="h-10 rounded-md border border-input bg-background px-3">
              {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {needsScope && <label className="grid gap-1 text-sm">Canonical scope ID
            <input required value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3" placeholder={audienceType === "COHORT" ? "Cohort ID" : "Class / section ID"} />
            <span className="text-xs text-muted-foreground">References the existing PMS cohort/class context; it does not create a Telegram-owned class.</span>
          </label>}
          <label className="grid gap-1 text-sm">Purpose
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3" placeholder="Staff operations and open teaching slots" />
          </label>
          <div className="md:col-span-2">
            <button className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Add destination</button>
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
          <code className="mt-3 block overflow-x-auto rounded-md border bg-background p-3 text-sm">{connection.command}</code>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Destinations</h2><p className="text-sm text-muted-foreground">Telegram membership is delivery routing only, never PMS authorization.</p></div>
          <button onClick={() => void load()} className="rounded-md border border-input px-3 py-2 text-sm">Refresh</button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading destinations…</p> : destinations.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No Telegram destinations yet.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {destinations.map((destination) => (
              <article key={destination.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="font-semibold">{destination.name}</h3><p className="mt-1 text-sm text-muted-foreground">{audienceLabels[destination.audienceType]} · {destination.chatTitle ?? destination.chatType.toLowerCase()}</p></div>
                  <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{destination.status}</span>
                </div>
                {destination.purpose && <p className="mt-3 text-sm">{destination.purpose}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><dt>Bot</dt><dd className="font-medium text-foreground">DSE PMS Bot</dd></div>
                  <div><dt>Type</dt><dd className="font-medium text-foreground">{destination.chatType}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!destination.connected && <button disabled={busyId === destination.id} onClick={() => void beginRegistration(destination)} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{destination.status === "OBSERVED" ? "Reconnect" : "Connect"}</button>}
                  {!destination.connected && <button disabled={busyId === destination.id} onClick={() => void checkAndConfirm(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Check & confirm</button>}
                  {destination.connected && <button disabled={busyId === destination.id} onClick={() => void sendTest(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Test message</button>}
                  <button disabled={busyId === destination.id} onClick={() => void toggle(destination)} className="rounded-md border border-input px-3 py-2 text-sm">{destination.enabled ? "Disable" : "Enable"}</button>
                  <button onClick={() => void showDeliveries(destination)} className="rounded-md border border-input px-3 py-2 text-sm">Deliveries</button>
                </div>
                {deliveries[destination.id] && <div className="mt-4 border-t pt-3"><h4 className="text-sm font-medium">Recent deliveries</h4><div className="mt-2 space-y-2">{deliveries[destination.id]!.length === 0 ? <p className="text-xs text-muted-foreground">No deliveries yet.</p> : deliveries[destination.id]!.slice(0, 5).map((delivery) => <div key={delivery.id} className="flex justify-between gap-3 text-xs"><span>{delivery.kind} · {new Date(delivery.updatedAt).toLocaleString()}</span><span className={delivery.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{delivery.status}{delivery.status === "failed" ? ` · ${delivery.lastError ?? "retry required"}` : ""}</span></div>)}</div></div>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
