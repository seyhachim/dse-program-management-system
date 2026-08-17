"use client";

import { useEffect, useState } from "react";
import type { TelegramLinkedAccount } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { api, ApiError } from "@/lib/api";

export function TelegramAccountCard() {
  const [account, setAccount] = useState<TelegramLinkedAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<TelegramLinkedAccount>("/api/telegram/account")
      .then(setAccount)
      .catch((error) => setMessage(error instanceof ApiError ? error.message : "Could not load Telegram link status"))
      .finally(() => setLoading(false));
  }, []);

  async function revoke() {
    setRevoking(true);
    setMessage(null);
    try {
      await api.delete("/api/telegram/account");
      setAccount({ linked: false });
      setConfirming(false);
      setMessage("Telegram disconnected. Existing Mini App sessions can no longer access your PMS account.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not disconnect Telegram");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="font-semibold text-foreground">Telegram Mini App</h2>
        <p className="text-sm text-muted-foreground">Manage the Telegram identity connected to your DSE PMS account.</p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Checking Telegram connection…</p> : account?.linked ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-foreground">Connected</p>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Active</span>
            </div>
            <p className="mt-1 text-muted-foreground">Telegram user {account.telegramUsername ? `@${account.telegramUsername}` : account.telegramUserId}</p>
            {account.linkedAt ? <p className="mt-1 text-xs text-muted-foreground">Connected {new Date(account.linkedAt).toLocaleString()}</p> : null}
          </div>

          {!confirming ? (
            <div className="space-y-2">
              <Button type="button" variant="outline" onClick={() => { setConfirming(true); setMessage(null); }}>
                Disconnect Telegram from PMS
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                To use a different PMS account with this Telegram identity, disconnect first, then start a fresh link from the official Mini App.
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-status-live/30 bg-status-live/5 p-4">
              <div>
                <p className="font-semibold text-foreground">Disconnect Telegram?</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This removes Telegram access to your DSE PMS account. Your PMS account, academic records, attendance, results, course specifications, and other PMS data will not be deleted.
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  You can connect Telegram again later, but changing accounts always requires a fresh Telegram verification and PMS sign-in.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={revoking} onClick={() => setConfirming(false)}>
                  Keep connected
                </Button>
                <Button type="button" disabled={revoking} onClick={() => void revoke()}>
                  {revoking ? "Disconnecting…" : "Disconnect Telegram"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No Telegram account is connected.</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Open the official DSE Mini App in Telegram to start a secure connection. Relinking always follows: fresh Telegram verification → PMS sign-in → account confirmation → connect.
          </p>
        </div>
      )}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
