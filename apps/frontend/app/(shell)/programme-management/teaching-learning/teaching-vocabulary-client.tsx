"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActiveLearningCluster,
  ActiveLearningStrategy,
  ManagedMethodsResponse,
  Method,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { methodsApi } from "@/lib/methods";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function VocabularyRow({
  item,
  onSave,
  onToggle,
}: {
  item: Method;
  onSave: (name: string) => Promise<void>;
  onToggle: () => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(item.name), [item.name]);

  return (
    <div className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !name.trim() || name.trim() === item.name}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(name.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onToggle();
          } finally {
            setBusy(false);
          }
        }}
      >
        {item.active ? "Archive" : "Restore"}
      </Button>
    </div>
  );
}

export function TeachingVocabularyClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [data, setData] = useState<ManagedMethodsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTeaching, setNewTeaching] = useState("");
  const [newClusterName, setNewClusterName] = useState("");
  const [newClusterDescription, setNewClusterDescription] = useState("");
  const [newStrategyName, setNewStrategyName] = useState("");
  const [newStrategyClusterId, setNewStrategyClusterId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await methodsApi.listManaged();
      setData(result);
      if (!newStrategyClusterId && result.activeLearningClusters[0]) {
        setNewStrategyClusterId(result.activeLearningClusters[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load teaching vocabulary");
    } finally {
      setLoading(false);
    }
  }, [newStrategyClusterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeClusters = useMemo(
    () => data?.activeLearningClusters.filter((cluster) => cluster.active) ?? [],
    [data],
  );

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save vocabulary changes");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading Teaching & Learning vocabulary…</p>;
  }

  if (!canWrite) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          This workspace requires programme:write permission. Lecturers can use the vocabulary in course specifications but cannot change it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Teaching Methods</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Programme-approved course teaching methods. Archive instead of deleting so historical CLO mappings remain valid.
          </p>
        </div>
        <div className="border-b border-border p-4">
          <div className="flex gap-2">
            <input
              value={newTeaching}
              onChange={(event) => setNewTeaching(event.target.value)}
              placeholder="Add teaching method…"
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              disabled={saving || !newTeaching.trim()}
              onClick={() =>
                void run(async () => {
                  await methodsApi.add("teaching", newTeaching.trim());
                  setNewTeaching("");
                })
              }
            >
              Add
            </Button>
          </div>
        </div>
        <div>
          {data?.teaching.map((method) => (
            <VocabularyRow
              key={method.id}
              item={method}
              onSave={(name) => methodsApi.rename("teaching", method.id, name).then(() => undefined)}
              onToggle={() => methodsApi.setActive("teaching", method.id, !method.active).then(() => load())}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Active Learning Clusters</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep the lecturer picker easy to scan by grouping strategies by teaching purpose.
          </p>
        </div>
        <div className="grid gap-2 border-b border-border p-4 md:grid-cols-[220px_1fr_auto]">
          <input
            value={newClusterName}
            onChange={(event) => setNewClusterName(event.target.value)}
            placeholder="Cluster name"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={newClusterDescription}
            onChange={(event) => setNewClusterDescription(event.target.value)}
            placeholder="Short description"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <Button
            disabled={saving || !newClusterName.trim() || !slugify(newClusterName)}
            onClick={() =>
              void run(async () => {
                const nextOrder = Math.max(0, ...(data?.activeLearningClusters.map((item) => item.sortOrder) ?? [0])) + 10;
                await methodsApi.createCluster({
                  id: slugify(newClusterName),
                  name: newClusterName.trim(),
                  description: newClusterDescription.trim(),
                  sortOrder: nextOrder,
                });
                setNewClusterName("");
                setNewClusterDescription("");
              })
            }
          >
            Add Cluster
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {data?.activeLearningClusters.map((cluster) => (
            <ClusterEditor
              key={cluster.id}
              cluster={cluster}
              allClusters={activeClusters}
              disabled={saving}
              onChanged={load}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Add Active Learning Strategy</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_240px_auto]">
          <input
            value={newStrategyName}
            onChange={(event) => setNewStrategyName(event.target.value)}
            placeholder="Strategy name"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <select
            value={newStrategyClusterId}
            onChange={(event) => setNewStrategyClusterId(event.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {activeClusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>{cluster.name}</option>
            ))}
          </select>
          <Button
            disabled={saving || !newStrategyName.trim() || !newStrategyClusterId || !slugify(newStrategyName)}
            onClick={() =>
              void run(async () => {
                const cluster = data?.activeLearningClusters.find((item) => item.id === newStrategyClusterId);
                const nextOrder = Math.max(0, ...(cluster?.strategies.map((item) => item.sortOrder) ?? [0])) + 10;
                await methodsApi.createStrategy({
                  id: slugify(newStrategyName),
                  name: newStrategyName.trim(),
                  clusterId: newStrategyClusterId,
                  sortOrder: nextOrder,
                });
                setNewStrategyName("");
              })
            }
          >
            Add Strategy
          </Button>
        </div>
      </section>
    </div>
  );
}

function ClusterEditor({
  cluster,
  allClusters,
  disabled,
  onChanged,
}: {
  cluster: ActiveLearningCluster;
  allClusters: ActiveLearningCluster[];
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(cluster.name);
  const [description, setDescription] = useState(cluster.description);

  useEffect(() => {
    setName(cluster.name);
    setDescription(cluster.description);
  }, [cluster.name, cluster.description]);

  async function refresh(action: () => Promise<unknown>) {
    await action();
    await onChanged();
  }

  return (
    <div className={`rounded-xl border p-4 ${cluster.active ? "border-border" : "border-dashed border-border opacity-70"}`}>
      <div className="grid gap-2 md:grid-cols-[180px_1fr_auto_auto]">
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <input value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !name.trim()}
          onClick={() => void refresh(() => methodsApi.updateCluster(cluster.id, { name: name.trim(), description: description.trim(), sortOrder: cluster.sortOrder }))}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void refresh(() => methodsApi.setClusterActive(cluster.id, !cluster.active))}
        >
          {cluster.active ? "Archive" : "Restore"}
        </Button>
      </div>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {cluster.strategies.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No strategies in this cluster.</p>
        ) : (
          cluster.strategies.map((strategy) => (
            <StrategyEditor
              key={strategy.id}
              strategy={strategy}
              clusters={allClusters}
              disabled={disabled}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StrategyEditor({
  strategy,
  clusters,
  disabled,
  onChanged,
}: {
  strategy: ActiveLearningStrategy;
  clusters: ActiveLearningCluster[];
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(strategy.name);
  const [clusterId, setClusterId] = useState(strategy.clusterId);

  useEffect(() => {
    setName(strategy.name);
    setClusterId(strategy.clusterId);
  }, [strategy.name, strategy.clusterId]);

  async function refresh(action: () => Promise<unknown>) {
    await action();
    await onChanged();
  }

  return (
    <div className={`grid gap-2 px-3 py-3 md:grid-cols-[1fr_200px_auto_auto] md:items-center ${strategy.active ? "" : "opacity-60"}`}>
      <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
      <select value={clusterId} onChange={(event) => setClusterId(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
        {clusters.map((cluster) => (
          <option key={cluster.id} value={cluster.id}>{cluster.name}</option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !name.trim() || !clusterId}
        onClick={() => void refresh(() => methodsApi.updateStrategy(strategy.id, { name: name.trim(), clusterId, sortOrder: strategy.sortOrder }))}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => void refresh(() => methodsApi.setStrategyActive(strategy.id, !strategy.active))}
      >
        {strategy.active ? "Archive" : "Restore"}
      </Button>
    </div>
  );
}
