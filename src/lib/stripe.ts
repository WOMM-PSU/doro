/**
 * Server-only Stripe helpers.
 *
 * The demo runs without keys: every route falls back to deterministic
 * `pi_doro_*` identifiers so the marketplace still works offline. With
 * `STRIPE_SECRET_KEY` set, the same routes create real PaymentIntents on the
 * platform account, optionally routed to a helper's Connect account and taxed
 * with Stripe Tax.
 */

import Stripe from "stripe";

let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  cached = key ? new Stripe(key, { appInfo: { name: "Doro", url: "https://dorohelp.us" } }) : null;
  return cached;
}

/** Stripe test/live keys both start with these prefixes. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Seeded and fallback intents are local-only; never send them to Stripe. */
export function isRealPaymentIntent(id: string | undefined | null): id is string {
  return Boolean(id && id.startsWith("pi_") && !id.startsWith("pi_doro_"));
}

/**
 * Doro is campus-free today, so the platform keeps nothing. Kept as a single
 * knob so a real marketplace fee can be switched on without touching routes.
 */
export const PLATFORM_FEE_BPS = 0;

export function platformFeeCents(totalCents: number): number {
  if (PLATFORM_FEE_BPS <= 0) return 0;
  return Math.round((totalCents * PLATFORM_FEE_BPS) / 10_000);
}

export interface TaxAddress {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface TaxResult {
  calculationId: string;
  taxCents: number;
  totalCents: number;
}

/**
 * Stripe Tax calculation for a single task payment. Stripe only charges tax in
 * jurisdictions where the account has an active registration, so this stays
 * zero until the dashboard is set up. Failures are non-fatal: a task payment
 * should never be blocked because tax is misconfigured.
 */
export async function calculateTax(
  stripe: Stripe,
  input: { amountCents: number; currency: string; address?: TaxAddress },
): Promise<TaxResult | null> {
  const country = input.address?.country;
  if (!country || !input.address?.postalCode) return null;
  try {
    const calculation = await stripe.tax.calculations.create({
      currency: input.currency,
      line_items: [
        {
          amount: input.amountCents,
          reference: "doro-task-reward",
          // General services: the closest code for paid favours and errands.
          tax_code: "txcd_99999999",
        },
      ],
      customer_details: {
        address: {
          line1: input.address.line1,
          city: input.address.city,
          state: input.address.state,
          postal_code: input.address.postalCode,
          country,
        },
        address_source: "shipping",
      },
    });
    if (!calculation.id) return null;
    return {
      calculationId: calculation.id,
      taxCents: calculation.tax_amount_exclusive ?? 0,
      totalCents: calculation.amount_total ?? input.amountCents,
    };
  } catch (error) {
    console.warn("Stripe Tax calculation skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Accounts v2 is not covered by the Node SDK types yet, so the Connect routes
 * talk to it over JSON. The preview version is the one Accounts v2 expects.
 */
export const STRIPE_V2_VERSION = "2026-09-30.preview";

export async function stripeV2<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: init?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_V2_VERSION,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const payload = (await response.json()) as { error?: { message?: string } } & T;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Stripe Accounts v2 request failed (${response.status}).`);
  }
  return payload;
}

export interface StripeV2Account {
  id: string;
  dashboard?: string;
  configuration?: {
    merchant?: { capabilities?: { card_payments?: { status?: string } } };
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          payouts?: { status?: string };
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
  requirements?: {
    summary?: { minimum_deadline?: { status?: string } };
    entries?: Array<{ description?: string; minimum_deadline?: { status?: string } }>;
  };
}

export interface StripeV2AccountLink {
  url: string;
  expires_at: string;
}

export function requestOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
