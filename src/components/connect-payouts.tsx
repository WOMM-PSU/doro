"use client";

import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { useDemo } from "@/components/providers";
import { Button, Pill, useToast } from "@/components/ui";
import {
  fetchConnectStatus,
  startConnectOnboarding,
  type ConnectStatusResponse,
} from "@/lib/stripe-client";
import { stripeCardsEnabled } from "@/lib/stripe-browser";

/**
 * Helpers receive task payouts through Stripe Connect Express. Until a server
 * database exists, the account id lives on the local demo profile.
 */
export function ConnectPayouts() {
  const { user, store } = useDemo();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<ConnectStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountId = user.stripeAccountId;
  const configured = stripeCardsEnabled();

  const refresh = async (id: string, quiet = false) => {
    if (!quiet) setChecking(true);
    const result = await fetchConnectStatus(id);
    setChecking(false);
    if (result.ok) {
      setStatus(result);
      // Destination charges need verified transfers capability, not just an id.
      if (result.payoutsEnabled && !user.stripeAccountReady) {
        store.setStripeAccount(user.id, id, true);
      }
    } else if (!quiet) {
      setError(result.error ?? "Could not check the Connect account.");
    }
  };

  useEffect(() => {
    if (!accountId) {
      setStatus(null);
      return;
    }
    void refresh(accountId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    if (!connect) return;
    if (connect === "done") {
      toast("Stripe onboarding submitted. Payouts unlock once Stripe verifies the account.", "success");
    } else if (connect === "refresh") {
      toast("That onboarding link expired. Start it again to finish setup.", "default");
    }
    params.delete("connect");
    const query = params.toString();
    window.history.replaceState({}, "", `/profile${query ? `?${query}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await startConnectOnboarding({
      userId: user.id,
      name: user.name,
      accountId,
    });
    setBusy(false);
    if (!result.ok || !result.onboardingUrl || !result.accountId) {
      setError(result.error ?? "Could not start Stripe onboarding.");
      return;
    }
    if (result.accountId !== accountId) store.setStripeAccount(user.id, result.accountId);
    window.location.href = result.onboardingUrl;
  };

  const ready = Boolean(status?.payoutsEnabled);
  const submitted = Boolean(status?.detailsSubmitted);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Banknote className="size-3.5" aria-hidden />
            Payouts · Stripe Connect
          </h2>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
            Helpers onboard with Stripe Express so task rewards can transfer straight to their bank.
          </p>
        </div>
        <Pill tone={ready ? "success" : submitted ? "neutral" : "neutral"}>
          {ready ? "Payouts ready" : submitted ? "In review" : accountId ? "Setup incomplete" : "Not set up"}
        </Pill>
      </div>

      {!configured ? (
        <p className="mt-2 rounded-xl bg-muted-surface px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          Add <span className="font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</span> and{" "}
          <span className="font-mono">STRIPE_SECRET_KEY</span> to enable Connect onboarding.
        </p>
      ) : (
        <>
          {accountId ? (
            <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[10.5px]">
              <div className="rounded-xl border border-line px-2.5 py-2">
                <dt className="text-muted">Account</dt>
                <dd className="mt-0.5 truncate font-mono text-[10px] text-ink">{accountId}</dd>
              </div>
              <div className="rounded-xl border border-line px-2.5 py-2">
                <dt className="text-muted">Card payouts</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {checking ? "Checking…" : ready ? "Enabled" : "Waiting on Stripe"}
                </dd>
              </div>
            </dl>
          ) : null}

          {status?.currentlyDue?.length ? (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Stripe still needs: {status.currentlyDue.slice(0, 4).join(", ")}
              {status.currentlyDue.length > 4 ? "…" : ""}
            </p>
          ) : null}

          {error ? (
            <p className="mt-2 text-[10.5px] font-medium text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant={ready ? "outline" : "dark"} onClick={() => void start()} disabled={busy}>
              {ready ? <CheckCircle2 className="size-3.5" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />}
              {busy
                ? "Opening Stripe…"
                : ready
                  ? "Update payout details"
                  : accountId
                    ? "Continue onboarding"
                    : "Set up payouts"}
            </Button>
            {accountId ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void refresh(accountId)}
                disabled={checking}
              >
                <RefreshCw className={checking ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                Refresh status
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-muted">
            Test mode: Stripe&apos;s sandbox onboarding accepts the test values shown in its form.
          </p>
        </>
      )}
    </section>
  );
}
