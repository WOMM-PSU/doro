import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook receiver. The demo keeps its state in the browser, so this
 * endpoint verifies the signature, logs the lifecycle events the marketplace
 * cares about, and acknowledges. Once state lives in Supabase, update the task
 * or payment row here instead of only logging.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json(
      { ok: false, error: "Stripe webhooks need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing Stripe-Signature header." }, { status: 400 });
  }

  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.amount_capturable_updated": {
      const intent = event.data.object;
      console.log(`[stripe] hold ready for ${intent.metadata.taskId} (${intent.id})`);
      break;
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      console.log(`[stripe] captured ${intent.amount_received} for ${intent.metadata.taskId} (${intent.id})`);
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      console.log(`[stripe] payment failed for ${intent.metadata.taskId}: ${intent.last_payment_error?.message ?? "unknown"}`);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      console.log(`[stripe] refunded ${charge.amount_refunded} on ${charge.payment_intent}`);
      break;
    }
    case "account.updated": {
      const account = event.data.object;
      console.log(
        `[stripe] connect account ${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled}`,
      );
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
