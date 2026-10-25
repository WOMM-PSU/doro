import { NextResponse } from "next/server";

export interface CreatePaymentIntentBody {
  taskId: string;
  title: string;
  rewardCents: number;
  expenseCents?: number;
  requesterId: string;
  helperId: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePaymentIntentBody;
    const rewardCents = Math.max(100, Math.round(Number(body.rewardCents) || 0));
    const expenseCents = Math.max(0, Math.round(Number(body.expenseCents) || 0));
    const platformFeeCents = 0;
    const totalCents = rewardCents + expenseCents + platformFeeCents;

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (secretKey) {
      const params = new URLSearchParams();
      params.set("amount", String(totalCents));
      params.set("currency", "usd");
      params.set("capture_method", "manual");
      params.set("description", `Doro task: ${body.title} (${body.taskId})`);
      params.set("metadata[taskId]", body.taskId);
      params.set("metadata[requesterId]", body.requesterId);
      params.set("metadata[helperId]", body.helperId);
      params.set("metadata[rewardCents]", String(rewardCents));
      params.set("metadata[expenseCents]", String(expenseCents));
      params.set("metadata[platformFeeCents]", "0");

      const response = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (response.ok) {
        const stripeData = (await response.json()) as {
          id: string;
          client_secret?: string;
          status: string;
        };
        return NextResponse.json({
          ok: true,
          mode: "live_stripe",
          paymentIntentId: stripeData.id,
          clientSecret: stripeData.client_secret ?? null,
          status: stripeData.status,
          breakdown: {
            rewardCents,
            expenseCents,
            platformFeeCents,
            totalCents,
          },
        });
      }
    }

    const fallbackId = `pi_doro_${body.taskId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now().toString(36)}`;
    return NextResponse.json({
      ok: true,
      mode: "test_fallback",
      paymentIntentId: fallbackId,
      clientSecret: null,
      status: "requires_capture",
      breakdown: {
        rewardCents,
        expenseCents,
        platformFeeCents,
        totalCents,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not initialize Stripe payment intent." },
      { status: 400 },
    );
  }
}
