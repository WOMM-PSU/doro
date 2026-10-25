import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  calculateTax,
  getStripe,
  platformFeeCents,
  type TaxAddress,
} from "@/lib/stripe";

export interface CreatePaymentIntentBody {
  taskId: string;
  title: string;
  rewardCents: number;
  expenseCents?: number;
  requesterId: string;
  helperId: string;
  /** Connect account of the helper, when onboarding has finished. */
  helperAccountId?: string;
  /** Optional billing address for Stripe Tax. */
  taxAddress?: TaxAddress;
  currency?: string;
}

function usdCents(value: unknown, minimum = 0): number {
  return Math.max(minimum, Math.round(Number(value) || 0));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePaymentIntentBody;
    const currency = (body.currency ?? "usd").toLowerCase();
    const rewardCents = usdCents(body.rewardCents, 100);
    const expenseCents = usdCents(body.expenseCents);
    const baseCents = rewardCents + expenseCents;
    const platformFee = platformFeeCents(baseCents);
    const stripe = getStripe();

    // No keys: keep the zero-setup demo working with a deterministic intent.
    if (!stripe) {
      return NextResponse.json({
        ok: true,
        mode: "test_fallback",
        paymentIntentId: `pi_doro_${body.taskId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now().toString(36)}`,
        clientSecret: null,
        status: "requires_capture",
        breakdown: {
          rewardCents,
          expenseCents,
          platformFeeCents: platformFee,
          taxCents: 0,
          totalCents: baseCents,
        },
      });
    }

    const tax = await calculateTax(stripe, { amountCents: baseCents, currency, address: body.taxAddress });
    const totalCents = tax ? tax.totalCents : baseCents;
    const helperAccountId =
      body.helperAccountId && body.helperAccountId.startsWith("acct_") ? body.helperAccountId : undefined;

    const params: Stripe.PaymentIntentCreateParams = {
      amount: totalCents,
      currency,
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      description: `Doro task: ${body.title} (${body.taskId})`.slice(0, 350),
      metadata: {
        taskId: body.taskId,
        requesterId: body.requesterId,
        helperId: body.helperId,
        rewardCents: String(rewardCents),
        expenseCents: String(expenseCents),
        platformFeeCents: String(platformFee),
        taxCents: String(tax?.taxCents ?? 0),
        taxCalculationId: tax?.calculationId ?? "",
      },
    };

    if (tax?.calculationId) {
      // Basic Stripe Tax integration: Stripe commits the tax transaction when
      // the intent is captured and reverses it on refunds. `hooks` is newer
      // than the SDK's bundled types, so it is attached explicitly.
      (params as Stripe.PaymentIntentCreateParams & {
        hooks?: { inputs?: { tax?: { calculation?: string } } };
      }).hooks = { inputs: { tax: { calculation: tax.calculationId } } };
    }

    if (helperAccountId) {
      params.transfer_data = { destination: helperAccountId };
      if (platformFee > 0) params.application_fee_amount = platformFee;
    }

    // Stripe rejects reused keys with different parameters, so the key hashes
    // the whole request. Identical retries are safe; edited tasks get a new key.
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          taskId: body.taskId,
          title: body.title,
          totalCents,
          currency,
          requesterId: body.requesterId,
          helperId: body.helperId,
          helperAccountId: helperAccountId ?? null,
          taxCalculationId: tax?.calculationId ?? null,
        }),
      )
      .digest("hex")
      .slice(0, 20);

    const intent = await stripe.paymentIntents.create(params, {
      idempotencyKey: `doro:${body.taskId}:${fingerprint}`,
    });

    return NextResponse.json({
      ok: true,
      mode: "live_stripe",
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      breakdown: {
        rewardCents,
        expenseCents,
        platformFeeCents: platformFee,
        taxCents: tax?.taxCents ?? 0,
        totalCents,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not initialize Stripe payment intent.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
