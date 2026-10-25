import { NextResponse } from "next/server";
import { isStripeConfigured, stripeV2, type StripeV2Account } from "@/lib/stripe";

const INCLUDES =
  "include[0]=configuration.merchant&include[1]=configuration.recipient&include[2]=requirements";

/** Poll Accounts v2 so the UI can show "ready for payouts". */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accountId?: string };
    if (!isStripeConfigured()) {
      return NextResponse.json({ ok: false, error: "Stripe is not configured." }, { status: 503 });
    }
    if (!body.accountId?.startsWith("acct_")) {
      return NextResponse.json({ ok: false, error: "A Connect account id is required." }, { status: 400 });
    }

    const account = await stripeV2<StripeV2Account>(
      `/v2/core/accounts/${encodeURIComponent(body.accountId)}?${INCLUDES}`,
      { method: "GET" },
    );

    const merchant = account.configuration?.merchant?.capabilities?.card_payments?.status;
    const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
    const transfers = balance?.payouts?.status ?? balance?.stripe_transfers?.status;
    const due = (account.requirements?.entries ?? [])
      .filter((entry) => entry.minimum_deadline?.status === "currently_due")
      .map((entry) => entry.description)
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);

    const advanced = merchant === "pending" || transfers === "pending" ||
      merchant === "active" || transfers === "active";

    return NextResponse.json({
      ok: true,
      accountId: account.id,
      // A freshly created Express account is restricted until onboarding runs.
      detailsSubmitted: advanced,
      chargesEnabled: merchant === "active",
      payoutsEnabled: transfers === "active",
      currentlyDue: due,
      disabledReason:
        merchant === "restricted" || transfers === "restricted" ? "Stripe needs more information." : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the Connect account.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
