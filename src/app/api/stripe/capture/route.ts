import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isRealPaymentIntent } from "@/lib/stripe";

export interface CapturePaymentIntentBody {
  taskId: string;
  paymentIntentId?: string;
  amountToCaptureCents?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CapturePaymentIntentBody;
    const stripe = getStripe();

    // Local demo intents and keyless installs stay simulated.
    if (!stripe || !isRealPaymentIntent(body.paymentIntentId)) {
      return NextResponse.json({
        ok: true,
        mode: "test_fallback",
        paymentIntentId: body.paymentIntentId || `pi_doro_${body.taskId.replace(/[^a-zA-Z0-9]/g, "")}`,
        status: "succeeded",
      });
    }

    const params: Stripe.PaymentIntentCaptureParams = {};
    if (body.amountToCaptureCents && body.amountToCaptureCents > 0) {
      params.amount_to_capture = Math.round(body.amountToCaptureCents);
    }
    // Destination charges move the helper's share as part of the capture.
    const intent = await stripe.paymentIntents.capture(body.paymentIntentId, params);
    return NextResponse.json({
      ok: true,
      mode: "live_stripe",
      paymentIntentId: intent.id,
      status: intent.status,
      amountCapturedCents: intent.amount_received,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not capture Stripe payment intent.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
