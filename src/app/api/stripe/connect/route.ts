import { NextResponse } from "next/server";
import {
  isStripeConfigured,
  requestOrigin,
  stripeV2,
  type StripeV2Account,
  type StripeV2AccountLink,
} from "@/lib/stripe";

export interface ConnectOnboardingBody {
  userId: string;
  name?: string;
  email?: string;
  /** Reuse an existing Express account instead of creating a new one. */
  accountId?: string;
}

const RETURN_PATH = "/profile?connect=done";
const REFRESH_PATH = "/profile?connect=refresh";

/**
 * Express onboarding for helpers through Stripe's Accounts v2 API. Doro keeps
 * no server database yet, so the account id is handed back to the client and
 * stored with the demo profile.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConnectOnboardingBody;
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." },
        { status: 503 },
      );
    }
    if (!body.userId) {
      return NextResponse.json({ ok: false, error: "A user id is required." }, { status: 400 });
    }

    const origin = requestOrigin(request);
    let accountId = body.accountId?.startsWith("acct_") ? body.accountId : undefined;

    if (!accountId) {
      const account = await stripeV2<StripeV2Account>("/v2/core/accounts", {
        body: {
          // Express recipients need a contact email. The demo has no accounts,
          // so fall back to a platform address until real sign-in exists.
          contact_email: body.email || process.env.STRIPE_CONNECT_EMAIL || "helpers@dorohelp.us",
          display_name: body.name || "Doro helper",
          identity: { country: "us", entity_type: "individual" },
          configuration: {
            merchant: {
              capabilities: { card_payments: { requested: true } },
            },
            recipient: {
              capabilities: {
                stripe_balance: { stripe_transfers: { requested: true } },
              },
            },
          },
          defaults: {
            currency: "usd",
            locales: ["en-US"],
            responsibilities: {
              fees_collector: "stripe",
              losses_collector: "stripe",
            },
          },
          dashboard: "express",
          metadata: { userId: body.userId, name: body.name ?? "" },
          include: ["configuration.merchant", "configuration.recipient", "requirements"],
        },
      });
      accountId = account.id;
    }

    const link = await stripeV2<StripeV2AccountLink>("/v2/core/account_links", {
      body: {
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            refresh_url: `${origin}${REFRESH_PATH}`,
            return_url: `${origin}${RETURN_PATH}`,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      accountId,
      onboardingUrl: link.url,
      expiresAt: link.expires_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Stripe Connect onboarding.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
