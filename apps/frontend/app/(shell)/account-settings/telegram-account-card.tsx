"use client";

import { useEffect, useState } from "react";
import type { TelegramLinkedAccount } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { api, ApiError } from "@/lib/api";

export function TelegramAccountCard() {
  const [account, setAccount] = useState<TelegramLinkedAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<TelegramLinkedAccount>("/api/telegram/account")
      .then(setAccount)
      .catch((error) => setMessage(error instanceof ApiError ? error.message : "Could not load Telegram link status"))
      .finally(() => setLoading(false));
  }, []);

  async function revoke() {
    setRevoking(true); setMessage(null);
    try {
      await api.delete("/api/telegram/account");
      setAccount({ linked: false });
      setMessage("Telegram access revoked. Existing Mini App sessions can no longer access PMS data.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not revoke Telegram access");
    } finally { setRevoking(false); }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="font-semibold text-foreground">Telegram Mini App</h2>
        <p className="text-sm text-muted-foreground">Manage the Telegram identity allowed to open your PMS companion app.</p>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Checking Telegram link…</p> : account?.linked ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Linked</p>
            <p className="text-muted-foreground">Telegram user {account.telegramUsername ? `@${account.telegramUsername}` : account.telegramUserId}</p>
            {account.linkedAt ? <p className="mt-1 text-xs text-muted-foreground">Linked {new Date(account.linkedAt).toLocaleString()}</p> : null}
          </div>
          <Button type="button" variant="outline" disabled={revoking} onClick={() => void revoke()}>
            {revoking ? "Revoking…" : "Revoke Telegram access"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No Telegram account is linked. Open the official DSE Mini App in Telegram to start a secure link.</p>
      )}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
