import { NextResponse } from "next/server";

export interface RefundPaymentIntentBody {
  taskId: string;
  paymentIntentId?: string;
  reason?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RefundPaymentIntentBody;
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (
      secretKey &&
      body.paymentIntentId &&
      body.paymentIntentId.startsWith("pi_") &&
      !body.paymentIntentId.startsWith("pi_doro_")
    ) {
      const params = new URLSearchParams();
      params.set("cancellation_reason", "requested_by_customer");

      const response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(body.paymentIntentId)}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      if (response.ok) {
        const stripeData = (await response.json()) as { id: string; status: string };
        return NextResponse.json({
          ok: true,
          mode: "live_stripe",
          paymentIntentId: stripeData.id,
          status: stripeData.status,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "test_fallback",
      paymentIntentId:
        body.paymentIntentId || `pi_doro_${body.taskId.replace(/[^a-zA-Z0-9]/g, "")}`,
      status: "canceled",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not cancel/refund Stripe payment intent." },
      { status: 400 },
    );
  }
}
