/**
 * Wording for a task's payment in each state. Cash tasks never place a hold, so
 * they get their own copy instead of the card-hold language.
 */

import type { DemoPayment } from "@/types";

export interface PaymentLabels {
  /** Short status for pills and list rows. */
  status: string;
  /** Heading line in the task's payment card. */
  title: string;
  /** One-sentence explanation under the breakdown. */
  body: string;
  /** Label for the total row of the breakdown. */
  totalLabel: string;
  tone: "neutral" | "success" | "danger";
}

const CARD: Record<DemoPayment["state"], PaymentLabels> = {
  DEMO_AUTHORIZED: {
    status: "Hold active",
    title: "Demo payment authorized",
    body: "No real money has been charged.",
    totalLabel: "Total authorized hold",
    tone: "neutral",
  },
  DEMO_RELEASED: {
    status: "Paid out",
    title: "Demo payout recorded",
    body: "No actual transfer occurred.",
    totalLabel: "Total paid out",
    tone: "success",
  },
  DEMO_REFUNDED: {
    status: "Hold released",
    title: "Demo authorization released",
    body: "No real money was ever charged.",
    totalLabel: "Hold released",
    tone: "neutral",
  },
  DEMO_DISPUTED: {
    status: "Paused",
    title: "Demo payment paused",
    body: "No real money has moved while the problem is reviewed.",
    totalLabel: "Total on hold",
    tone: "danger",
  },
};

const CASH: Record<DemoPayment["state"], PaymentLabels> = {
  DEMO_AUTHORIZED: {
    status: "Cash due at handoff",
    title: "Cash due at handoff",
    body: "Pay the helper in cash once the 4-digit handoff code is confirmed.",
    totalLabel: "Total due in cash",
    tone: "neutral",
  },
  DEMO_RELEASED: {
    status: "Paid in cash",
    title: "Paid in cash at handoff",
    body: "Settled in person. No money moved through Doro.",
    totalLabel: "Total paid in cash",
    tone: "success",
  },
  DEMO_REFUNDED: {
    status: "Nothing owed",
    title: "Task cancelled",
    body: "The task was cancelled, so no cash is owed.",
    totalLabel: "Nothing owed",
    tone: "neutral",
  },
  DEMO_DISPUTED: {
    status: "Paused",
    title: "Cash payment on hold",
    body: "Hold off on paying until the problem is sorted out.",
    totalLabel: "Total due once resolved",
    tone: "danger",
  },
};

export function paymentLabels(payment: Pick<DemoPayment, "state" | "paymentMethod">): PaymentLabels {
  return (payment.paymentMethod === "cash_handoff" ? CASH : CARD)[payment.state];
}
