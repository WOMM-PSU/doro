import { describe, expect, it } from "vitest";
import { DemoStore, canTransition } from "@/features/store";
import { createSeedState } from "@/features/seed";
import { getDiscoverTasks, DEFAULT_FILTERS } from "@/features/selectors";
import type { Task, TaskDraft } from "@/types";

function makeStore(now = new Date()) {
  return new DemoStore(createSeedState(now), { persist: false });
}

function task(store: DemoStore, id: string): Task {
  const found = store.getSnapshot().tasks.find((t) => t.id === id);
  if (!found) throw new Error(`Missing task ${id}`);
  return found;
}

function futureDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: "Deliver a notebook to the HUB",
    description: "Bring the notebook from West Halls to the HUB front desk, please.",
    category: "delivery",
    locationId: "west-halls",
    dropoffLocationId: "hub",
    rewardCents: 500,
    acceptanceMode: "fixed",
    deadline: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    estimatedMinutes: 10,
    requiredSkills: ["delivery"],
    ...overrides,
  };
}

describe("seed integrity", () => {
  it("has internally consistent references, timestamps and payments", () => {
    const state = createSeedState();
    const userIds = new Set(state.users.map((u) => u.id));
    const taskIds = new Set(state.tasks.map((t) => t.id));

    for (const t of state.tasks) {
      expect(userIds.has(t.requesterId)).toBe(true);
      if (t.helperId) expect(userIds.has(t.helperId)).toBe(true);
      expect(Number.isFinite(new Date(t.deadline).getTime())).toBe(true);
      expect(t.rewardCents).toBeGreaterThan(0);
      if (t.status === "COMPLETED") expect(t.completedAt).toBeTruthy();
      if (t.status === "CANCELLED") expect(t.cancelledAt).toBeTruthy();
      if (t.agreedRewardCents) expect(t.helperId).toBeTruthy();
    }
    for (const offer of state.offers) {
      expect(taskIds.has(offer.taskId)).toBe(true);
      expect(userIds.has(offer.senderId)).toBe(true);
    }
    for (const message of state.messages) {
      expect(taskIds.has(message.taskId)).toBe(true);
      expect(userIds.has(message.senderId)).toBe(true);
    }
    for (const notification of state.notifications) {
      expect(userIds.has(notification.userId)).toBe(true);
      if (notification.taskId) expect(taskIds.has(notification.taskId)).toBe(true);
    }
    for (const payment of state.payments) {
      const linked = state.tasks.find((t) => t.id === payment.taskId)!;
      expect(userIds.has(payment.helperId)).toBe(true);
      expect(linked.helperId).toBe(payment.helperId);
      expect(payment.rewardCents).toBe(linked.agreedRewardCents ?? linked.rewardCents);
      if (linked.status === "COMPLETED") expect(payment.state).toBe("DEMO_RELEASED");
      if (payment.state === "DEMO_RELEASED") expect(linked.status).toBe("COMPLETED");
    }
    expect(state.payments.some((p) => p.taskId === "t-cancelled-pump")).toBe(false);
    expect(state.payments.some((p) => p.taskId === "t-cancelled-ride")).toBe(false);
    expect(state.users.length).toBeGreaterThanOrEqual(4);
    expect(state.tasks.length).toBeGreaterThanOrEqual(12);
  });
});

describe("task lifecycle", () => {
  it("only permits the documented transitions", () => {
    expect(canTransition("OPEN", "ASSIGNED")).toBe(true);
    expect(canTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "AWAITING_CONFIRMATION")).toBe(true);
    expect(canTransition("AWAITING_CONFIRMATION", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "OPEN")).toBe(false);
    expect(canTransition("OPEN", "COMPLETED")).toBe(false);
  });

  it("rejects self-acceptance and a second helper on the same task", () => {
    const store = makeStore();
    expect(store.acceptTask("t-notebook").ok).toBe(false);

    store.setActiveUser("u-alex");
    const accepted = store.acceptTask("t-notebook");
    expect(accepted.ok).toBe(true);

    store.setActiveUser("u-sam");
    const second = store.acceptTask("t-notebook");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/no longer|claimed/i);
  });

  it("runs assignment → start → handoff → ready → completion → review with one payout", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    expect(store.acceptTask("t-notebook").ok).toBe(true);
    const assigned = task(store, "t-notebook");
    expect(assigned.status).toBe("ASSIGNED");
    expect(assigned.agreedRewardCents).toBe(500);
    expect(assigned.handoffCode).toMatch(/^\d{4}$/);

    const payment = store.getSnapshot().payments.find((p) => p.taskId === "t-notebook")!;
    expect(payment.state).toBe("DEMO_AUTHORIZED");
    expect(payment.helperId).toBe("u-alex");

    const requesterNotifications = store
      .getSnapshot()
      .notifications.filter((n) => n.userId === "u-maya" && n.taskId === "t-notebook");
    expect(requesterNotifications.some((n) => n.kind === "TASK_ACCEPTED")).toBe(true);

    expect(store.startTask("t-notebook").ok).toBe(true);
    expect(task(store, "t-notebook").status).toBe("IN_PROGRESS");
    expect(store.markTaskReady("t-notebook").ok).toBe(false);
    expect(store.verifyHandoff("t-notebook", "0000").ok).toBe(false);
    expect(store.verifyHandoff("t-notebook", assigned.handoffCode!).ok).toBe(true);
    expect(task(store, "t-notebook").handoffVerified).toBe(true);
    expect(store.markTaskReady("t-notebook").ok).toBe(true);
    expect(task(store, "t-notebook").status).toBe("AWAITING_CONFIRMATION");

    expect(store.startTask("t-notebook").ok).toBe(false);
    store.setActiveUser("u-maya");
    expect(store.confirmTaskCompletion("t-notebook").ok).toBe(true);
    expect(task(store, "t-notebook").status).toBe("COMPLETED");
    const released = store.getSnapshot().payments.find((p) => p.taskId === "t-notebook")!;
    expect(released.state).toBe("DEMO_RELEASED");
    expect(store.confirmTaskCompletion("t-notebook").ok).toBe(false);
    expect(
      store.getSnapshot().payments.filter((p) => p.taskId === "t-notebook"),
    ).toHaveLength(1);

    expect(store.submitReview("t-notebook", 5, "Friendly and quick.").ok).toBe(true);
    expect(store.submitReview("t-notebook", 4, "Again").ok).toBe(false);

    store.setActiveUser("u-sam");
    expect(store.submitReview("t-notebook", 5, "Not my task").ok).toBe(false);
  });

  it("requires completion to come from the requester after handoff", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    expect(store.acceptTask("t-notebook").ok).toBe(true);
    expect(store.confirmTaskCompletion("t-notebook").ok).toBe(false);
    expect(store.startTask("t-notebook").ok).toBe(true);
    store.setActiveUser("u-alex");
    expect(store.markTaskReady("t-notebook").ok).toBe(false); // no handoff yet
  });

  it("blocks expired tasks from discovery and acceptance", () => {
    const seed = createSeedState();
    const notebook = seed.tasks.find((t) => t.id === "t-notebook")!;
    notebook.deadline = new Date(Date.now() - 60_000).toISOString();
    const store = new DemoStore(seed, { persist: false });
    store.setActiveUser("u-alex");
    expect(store.acceptTask("t-notebook").ok).toBe(false);
    const feed = getDiscoverTasks(
      store.getSnapshot(),
      store.getSnapshot().users.find((u) => u.id === "u-alex")!,
      { ...DEFAULT_FILTERS, maxDistanceMiles: 3 },
    );
    expect(feed.some((item) => item.task.id === "t-notebook")).toBe(false);
  });

  it("cancels a task, releases the demo authorization, and notifies the helper", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    expect(store.acceptTask("t-notebook").ok).toBe(true);
    store.setActiveUser("u-maya");
    expect(store.cancelTask("t-notebook", "Found another way to get it there.").ok).toBe(true);
    expect(task(store, "t-notebook").status).toBe("CANCELLED");
    expect(
      store.getSnapshot().payments.find((p) => p.taskId === "t-notebook")!.state,
    ).toBe("DEMO_REFUNDED");
    expect(
      store
        .getSnapshot()
        .notifications.some(
          (n) => n.userId === "u-alex" && n.kind === "TASK_CANCELLED" && n.taskId === "t-notebook",
        ),
    ).toBe(true);
    expect(store.acceptTask("t-notebook").ok).toBe(false);
  });
});

describe("offers and assignment", () => {
  it("accepts an offer, locks the agreed reward, and supersedes other offers", () => {
    const store = makeStore();
    store.setActiveUser("u-sam");
    const made = store.makeOffer(
      "t-stationery",
      950,
      "I can grab it on my way back to East Halls.",
    );
    expect(made.ok).toBe(true);
    const offers = store.getSnapshot().offers.filter((o) => o.taskId === "t-stationery");
    expect(offers.some((o) => o.senderId === "u-sam" && o.status === "PENDING")).toBe(true);
    // The seeded Alex offer is still pending before acceptance.
    expect(offers.some((o) => o.senderId === "u-alex" && o.status === "PENDING")).toBe(true);

    store.setActiveUser("u-maya");
    const samOffer = store
      .getSnapshot()
      .offers.find((o) => o.taskId === "t-stationery" && o.senderId === "u-sam")!;
    expect(store.acceptOffer(samOffer.id).ok).toBe(true);

    const assigned = task(store, "t-stationery");
    expect(assigned.status).toBe("ASSIGNED");
    expect(assigned.helperId).toBe("u-sam");
    expect(assigned.agreedRewardCents).toBe(950);
    expect(
      store.getSnapshot().payments.find((p) => p.taskId === "t-stationery")!.rewardCents,
    ).toBe(950);
    const alexOffer = store.getSnapshot().offers.find((o) => o.id === "o-stationery-alex")!;
    expect(alexOffer.status).toBe("SUPERSEDED");
    expect(
      store
        .getSnapshot()
        .offers.filter((o) => o.taskId === "t-stationery" && o.status === "PENDING"),
    ).toHaveLength(0);

    // Another helper cannot accept the now-filled task.
    store.setActiveUser("u-alex");
    expect(store.acceptTask("t-stationery").ok).toBe(false);
  });

  it("lets a helper withdraw a pending offer and blocks non-requesters from accepting it", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    const offer = store.makeOffer("t-desk", 2000, "I can do this tomorrow morning.");
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    store.setActiveUser("u-sam");
    expect(store.acceptOffer(offer.data.id).ok).toBe(false);
    store.setActiveUser("u-alex");
    expect(store.withdrawOffer(offer.data.id).ok).toBe(true);
    expect(
      store.getSnapshot().offers.find((o) => o.id === offer.data.id)!.status,
    ).toBe("WITHDRAWN");
  });
});

describe("task creation", () => {
  it("publishes a task owned by the active requester and makes it discoverable", () => {
    const store = makeStore();
    const before = store.getSnapshot().tasks.length;
    const result = store.createTask(futureDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const created = result.data;
    expect(created.requesterId).toBe("u-maya");
    expect(created.status).toBe("OPEN");
    expect(store.getSnapshot().tasks).toHaveLength(before + 1);
    expect(
      store.getSnapshot().events.some((e) => e.taskId === created.id && e.type === "CREATED"),
    ).toBe(true);

    store.setActiveUser("u-alex");
    const feed = getDiscoverTasks(
      store.getSnapshot(),
      store.getSnapshot().users.find((u) => u.id === "u-alex")!,
      { ...DEFAULT_FILTERS, maxDistanceMiles: 3 },
    );
    expect(feed.some((item) => item.task.id === created.id)).toBe(true);
    expect(store.acceptTask(created.id).ok).toBe(true);
  });

  it("validates rewards, deadlines, ownership and prohibited requests", () => {
    const store = makeStore();
    const prohibited = store.createTask(
      futureDraft({
        title: "Drive me to the airport",
        description: "Need a paid passenger ride to Pittsburgh airport tonight.",
      }),
    );
    expect(prohibited.ok).toBe(false);
    if (!prohibited.ok) expect(prohibited.error).toMatch(/can't support/i);

    expect(store.createTask(futureDraft({ rewardCents: 0 })).ok).toBe(false);
    expect(store.createTask(futureDraft({ title: "Hi" })).ok).toBe(false);
    expect(
      store.createTask(
        futureDraft({ deadline: new Date(Date.now() + 60_000).toISOString() }),
      ).ok,
    ).toBe(false);
    expect(
      store.createTask(futureDraft({ locationId: "hub", dropoffLocationId: "hub" })).ok,
    ).toBe(false);
  });
});

describe("messaging, notifications and reports", () => {
  it("keeps messaging task-scoped and rejects whitespace", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    expect(store.acceptTask("t-notebook").ok).toBe(true);
    expect(store.sendMessage("t-notebook", "   ").ok).toBe(false);
    expect(store.sendMessage("t-notebook", "On my way to West Halls now.").ok).toBe(true);

    const messages = store.getSnapshot().messages.filter((m) => m.taskId === "t-notebook");
    expect(messages).toHaveLength(1);
    expect(messages[0].senderId).toBe("u-alex");
    expect(
      store.getSnapshot().notifications.some(
        (n) => n.userId === "u-maya" && n.kind === "MESSAGE" && n.taskId === "t-notebook",
      ),
    ).toBe(true);

    store.setActiveUser("u-sam");
    expect(store.sendMessage("t-notebook", "Sneaking in").ok).toBe(false);

    store.setActiveUser("u-jordan");
    expect(store.sendMessage("t-notebook", "Wrong task").ok).toBe(false);
  });

  it("does not duplicate notifications for the same event and keeps read state per user", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    store.acceptTask("t-notebook");
    const counts = store.getSnapshot().notifications.filter(
      (n) => n.taskId === "t-notebook" && n.kind === "TASK_ACCEPTED",
    );
    expect(counts).toHaveLength(1);
    expect(counts[0].dedupeKey).toBe("accepted:t-notebook");

    const mayaNotification = counts[0];
    store.setActiveUser("u-alex");
    store.markNotificationRead(mayaNotification.id);
    expect(
      store.getSnapshot().notifications.find((n) => n.id === mayaNotification.id)!.read,
    ).toBe(false);

    store.setActiveUser("u-maya");
    store.markNotificationRead(mayaNotification.id);
    expect(
      store.getSnapshot().notifications.find((n) => n.id === mayaNotification.id)!.read,
    ).toBe(true);
  });

  it("submits a report once and lets a demo moderator review it", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    const report = store.submitReport({
      subject: "TASK",
      taskId: "t-umbrella",
      reason: "Spam or misleading task",
      details: "Repeatedly reposted with a changed reward.",
    });
    expect(report.ok).toBe(true);
    expect(
      store.submitReport({
        subject: "TASK",
        taskId: "t-umbrella",
        reason: "Spam or misleading task",
      }).ok,
    ).toBe(false);

    expect(store.resolveReport("rep-1", "REVIEWED").ok).toBe(false);
    store.setActiveUser("u-maya");
    expect(store.resolveReport("rep-1", "REVIEWED").ok).toBe(true);
  });
});

describe("demo integrity", () => {
  it("switches personas without resetting marketplace state", () => {
    const store = makeStore();
    const before = store.getSnapshot().tasks.length;
    store.setActiveUser("u-alex");
    store.acceptTask("t-notebook");
    store.setActiveUser("u-maya");
    expect(store.getSnapshot().tasks.length).toBe(before);
    expect(task(store, "t-notebook").helperId).toBe("u-alex");
  });

  it("resets everything to the seeded state", () => {
    const store = makeStore();
    store.setActiveUser("u-alex");
    store.acceptTask("t-notebook");
    expect(store.getSnapshot().activeUserId).toBe("u-alex");
    store.resetDemo();
    const state = store.getSnapshot();
    expect(state.activeUserId).toBe("u-maya");
    expect(state.tasks.find((t) => t.id === "t-notebook")!.status).toBe("OPEN");
    expect(state.payments.filter((p) => p.taskId === "t-notebook")).toHaveLength(0);
  });

  it("never claims a real payout in demo payment copy", () => {
    const state = createSeedState();
    for (const payment of state.payments) {
      expect(payment.note.toLowerCase()).toMatch(/demo|no real|no actual/);
      expect(payment.note.toLowerCase()).not.toContain("escrow");
    }
  });

  it("handles Stripe card escrow and cash at handoff payment methods", () => {
    const store = makeStore();
    // 1. Post a cash task
    const cashTaskResult = store.createTask(
      futureDraft({
        title: "Cash errand task",
        paymentMethod: "cash_handoff",
        rewardCents: 800,
        expenseCents: 200,
      }),
    );
    expect(cashTaskResult.ok).toBe(true);
    if (!cashTaskResult.ok) return;

    store.setActiveUser("u-alex");
    expect(store.acceptTask(cashTaskResult.data.id).ok).toBe(true);

    const cashPayment = store
      .getSnapshot()
      .payments.find((p) => p.taskId === cashTaskResult.data.id)!;
    expect(cashPayment.paymentMethod).toBe("cash_handoff");
    expect(cashPayment.rewardCents).toBe(800);
    expect(cashPayment.expenseCents).toBe(200);
    expect(cashPayment.platformFeeCents).toBe(0);
    expect(cashPayment.totalCents).toBe(1000);
    expect(cashPayment.stripePaymentIntentId).toBeUndefined();

    // 2. Post a Stripe card task
    store.setActiveUser("u-maya");
    const stripeTaskResult = store.createTask(
      futureDraft({
        title: "Stripe escrow task",
        paymentMethod: "stripe_card",
        rewardCents: 1500,
      }),
    );
    expect(stripeTaskResult.ok).toBe(true);
    if (!stripeTaskResult.ok) return;

    store.setActiveUser("u-alex");
    expect(store.acceptTask(stripeTaskResult.data.id).ok).toBe(true);
    const stripePayment = store
      .getSnapshot()
      .payments.find((p) => p.taskId === stripeTaskResult.data.id)!;
    expect(stripePayment.paymentMethod).toBe("stripe_card");
    expect(stripePayment.stripePaymentIntentId).toMatch(/^pi_doro_/);

    // 3. Attach custom Stripe PaymentIntent ID
    store.attachStripePaymentIntent(
      stripeTaskResult.data.id,
      "pi_3NxyzRealIntent123",
      "live_stripe",
    );
    const updated = store
      .getSnapshot()
      .payments.find((p) => p.taskId === stripeTaskResult.data.id)!;
    expect(updated.stripePaymentIntentId).toBe("pi_3NxyzRealIntent123");
    expect(updated.stripeMode).toBe("live_stripe");
  });
});
