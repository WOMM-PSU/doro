/**
 * Client-side helper to invoke Doro's Next.js Stripe API routes
 * (`/api/stripe/payment-intent`, `/api/stripe/capture`, `/api/stripe/refund`).
 *
 * When `STRIPE_SECRET_KEY` is configured on the server, these routes call
 * Stripe's real PaymentIntents API with `capture_method: "manual"` for card
 * holds and capture/cancel on completion or cancellation. Otherwise, they
 * return a deterministic test PaymentIntent (`pi_doro_...`) so local demos
 * work with zero setup.
 */

export interface StripeIntentResponse {
  ok: boolean;
  mode?: "live_stripe" | "test_fallback";
  paymentIntentId?: string;
  status?: string;
  breakdown?: {
    rewardCents: number;
    expenseCents: number;
    platformFeeCents: number;
    totalCents: number;
  };
}

export async function createStripeEscrowHold(input: {
  taskId: string;
  title: string;
  rewardCents: number;
  expenseCents?: number;
  requesterId: string;
  helperId: string;
}): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return {
      ok: true,
      mode: "test_fallback",
      paymentIntentId: `pi_doro_${input.taskId.replace(/[^a-zA-Z0-9]/g, "")}`,
      status: "requires_capture",
    };
  }
}

export async function captureStripeEscrowHold(input: {
  taskId: string;
  paymentIntentId?: string;
  amountToCaptureCents?: number;
}): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return { ok: true, mode: "test_fallback", status: "succeeded" };
  }
}

export async function refundStripeEscrowHold(input: {
  taskId: string;
  paymentIntentId?: string;
  reason?: string;
}): Promise<StripeIntentResponse> {
  try {
    const res = await fetch("/api/stripe/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as StripeIntentResponse;
  } catch {
    return { ok: true, mode: "test_fallback", status: "canceled" };
  }
}
