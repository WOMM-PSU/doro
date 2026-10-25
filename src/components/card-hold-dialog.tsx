"use client";

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Lock } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { getStripeJs } from "@/lib/stripe-browser";

function CardForm({
  amountLabel,
  onAuthorized,
  onCancel,
}: {
  amountLabel: string;
  onAuthorized: (status: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      // Escrow takes a hold now; confirmation never needs a redirect for cards.
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/activity`,
      },
    });

    if (result.error) {
      setError(result.error.message ?? "That card could not be authorized.");
      setBusy(false);
      return;
    }

    setBusy(false);
    onAuthorized(result.paymentIntent?.status ?? "requires_capture");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-3">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error ? (
        <p className="rounded-xl border border-[#f1d3ce] bg-danger-soft px-3 py-2 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl bg-muted-surface px-3 py-2 text-[11px] leading-relaxed text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          Stripe holds {amountLabel} on your card now and only captures it when you confirm the
          task is done. Cancel the task and the hold is released.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Not now
        </Button>
        <Button type="submit" variant="lime" disabled={busy || !stripe}>
          <CreditCard className="size-4" aria-hidden />
          {busy ? "Authorizing…" : `Authorize ${amountLabel}`}
        </Button>
      </div>
    </form>
  );
}

export function CardHoldDialog({
  open,
  title,
  clientSecret,
  amountLabel,
  onClose,
  onAuthorized,
}: {
  open: boolean;
  title: string;
  clientSecret: string | null;
  amountLabel: string;
  onClose: () => void;
  onAuthorized: (status: string) => void;
}) {
  const stripePromise = useMemo(() => getStripeJs(), []);
  const options = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: {
              theme: "stripe" as const,
              variables: {
                colorPrimary: "#17191c",
                colorBackground: "#ffffff",
                colorText: "#17191c",
                borderRadius: "12px",
              },
            },
          }
        : undefined,
    [clientSecret],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Authorize card hold"
      description={title}
      size="sm"
    >
      {clientSecret && options ? (
        <Elements stripe={stripePromise} options={options}>
          <CardForm amountLabel={amountLabel} onAuthorized={onAuthorized} onCancel={onClose} />
        </Elements>
      ) : (
        <p className="py-6 text-center text-sm text-muted">Preparing secure card form…</p>
      )}
    </Modal>
  );
}
