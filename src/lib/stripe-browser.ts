/** Browser-side Stripe.js. The publishable key is safe to ship to the client. */

import { loadStripe, type Stripe } from "@stripe/stripe-js";

let cached: Promise<Stripe | null> | null = null;

export function stripePublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return key && key.startsWith("pk_") ? key : null;
}

/** Card entry only appears when a publishable key is present. */
export function stripeCardsEnabled(): boolean {
  return stripePublishableKey() !== null;
}

export function getStripeJs(): Promise<Stripe | null> {
  const key = stripePublishableKey();
  if (!key) return Promise.resolve(null);
  if (!cached) cached = loadStripe(key);
  return cached;
}
