import { describe, expect, it } from "vitest";
import { paymentLabels } from "@/lib/payment-labels";

describe("paymentLabels", () => {
  it("never claims a real charge on a card hold", () => {
    const labels = paymentLabels({ state: "DEMO_AUTHORIZED", paymentMethod: "stripe_card" });
    expect(labels.status).toBe("Hold active");
    expect(labels.body.toLowerCase()).toContain("no real money");
  });

  it("uses cash wording instead of card-hold language", () => {
    const due = paymentLabels({ state: "DEMO_AUTHORIZED", paymentMethod: "cash_handoff" });
    const paid = paymentLabels({ state: "DEMO_RELEASED", paymentMethod: "cash_handoff" });
    expect(due.title).toBe("Cash due at handoff");
    expect(due.body).toMatch(/cash/i);
    expect(paid.status).toBe("Paid in cash");
    expect(`${paid.title} ${paid.body}`).not.toMatch(/stripe|card hold/i);
  });

  it("falls back to card copy when the method is unknown", () => {
    const labels = paymentLabels({ state: "DEMO_REFUNDED", paymentMethod: undefined });
    expect(labels.title).toMatch(/demo authorization/i);
  });
});
