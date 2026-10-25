import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isRealPaymentIntent } from "@/lib/stripe";

export interface RefundPaymentIntentBody {
  taskId: string;
  paymentIntentId?: string;
  amountCents?: number;
  reason?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RefundPaymentIntentBody;
    const stripe = getStripe();

    if (!stripe || !isRealPaymentIntent(body.paymentIntentId)) {
      return NextResponse.json({
        ok: true,
        mode: "test_fallback",
        paymentIntentId: body.paymentIntentId || `pi_doro_${body.taskId.replace(/[^a-zA-Z0-9]/g, "")}`,
        status: "canceled",
      });
    }

    const intent = await stripe.paymentIntents.retrieve(body.paymentIntentId);

    // A hold that was never captured is released by cancelling the intent.
    if (intent.status === "requires_capture" || intent.status === "requires_payment_method") {
      const canceled = await stripe.paymentIntents.cancel(body.paymentIntentId, {
        cancellation_reason: "requested_by_customer",
      });
      return NextResponse.json({
        ok: true,
        mode: "live_stripe",
        paymentIntentId: canceled.id,
        status: canceled.status,
      });
    }

    if (intent.status !== "succeeded") {
      return NextResponse.json(
        { ok: false, error: `Nothing to refund: the payment is ${intent.status}.` },
        { status: 409 },
      );
    }

    const params: Stripe.RefundCreateParams = {
      payment_intent: body.paymentIntentId,
      reason: "requested_by_customer",
      // Destination charges already moved the helper's share; pull it back.
      reverse_transfer: Boolean(intent.transfer_data?.destination),
      refund_application_fee: Boolean(intent.application_fee_amount),
    };
    if (body.amountCents && body.amountCents > 0) {
      params.amount = Math.min(Math.round(body.amountCents), intent.amount_received);
    }

    const refund = await stripe.refunds.create(params, {
      idempotencyKey: `doro-refund:${body.paymentIntentId}:${params.amount ?? "full"}`,
    });
    return NextResponse.json({
      ok: true,
      mode: "live_stripe",
      paymentIntentId: body.paymentIntentId,
      refundId: refund.id,
      status: refund.status,
      amountRefundedCents: refund.amount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel/refund Stripe payment intent.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
