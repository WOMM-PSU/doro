import { NextResponse } from "next/server";
import { getStripe, isRealPaymentIntent } from "@/lib/stripe";

/** The client needs a secret to mount the Payment Element for an existing intent. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { paymentIntentId?: string };
    const stripe = getStripe();
    if (!stripe || !isRealPaymentIntent(body.paymentIntentId)) {
      return NextResponse.json(
        { ok: false, error: "Card payments are not configured for this intent." },
        { status: 400 },
      );
    }
    const intent = await stripe.paymentIntents.retrieve(body.paymentIntentId);
    return NextResponse.json({
      ok: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the payment intent.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
