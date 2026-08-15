"use client";

import { useEffect, useState } from "react";
import {
  TelegramPublicConfigSchema,
  type TelegramPublicConfig,
} from "@dse-pms/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; config: TelegramPublicConfig };

export function TelegramStatus() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${API_URL}/api/telegram/config`);
        if (!response.ok) throw new Error("Telegram config request failed");
        const config = TelegramPublicConfigSchema.parse(await response.json());
        if (!cancelled) setState({ status: "ready", config });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <p className="text-sm text-slate-500">Checking PMS connection…</p>;
  }

  if (state.status === "error") {
    return <p className="text-sm text-amber-700">PMS API is not reachable.</p>;
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-slate-900">PMS API connected</p>
      <p className="text-slate-600">
        Telegram integration is {state.config.enabled ? "enabled" : "disabled"}.
      </p>
      <p className="text-slate-500">
        Account access will be enabled in a later release.
      </p>
    </div>
  );
}
