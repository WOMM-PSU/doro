"use client";

import { Banknote, CalendarDays, Clock3, CreditCard, MapPin, ShieldCheck } from "lucide-react";
import { useDemo, useUi } from "@/components/providers";
import { canAcceptTask, getTask, getUser, getUserStats } from "@/features/selectors";
import { taskDropoff, taskPickup } from "@/lib/places";
import { createStripeEscrowHold } from "@/lib/stripe-client";
import { formatDeadline } from "@/lib/time";
import { formatMoney } from "@/lib/format";
import { Avatar, Button, Modal, StatusBadge, useToast } from "@/components/ui";

export function AcceptTaskDialog() {
  const { state, user, store } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const task = getTask(state, ui.acceptTaskId ?? undefined);
  const open = Boolean(ui.acceptTaskId);
  const requester = task ? getUser(state, task.requesterId) : undefined;
  const allowed = task ? canAcceptTask(task, user) : false;
  const requesterStats = requester ? getUserStats(state, requester) : null;

  if (!task) {
    return (
      <Modal open={open} onClose={ui.closeAccept} title="Task unavailable" size="sm">
        <p className="text-sm text-muted">This task is no longer available.</p>
      </Modal>
    );
  }

  const reward =
    task.acceptanceMode === "fixed" ? task.rewardCents : task.agreedRewardCents ?? task.rewardCents;

  return (
    <Modal
      open={open}
      onClose={ui.closeAccept}
      title="Accept this task?"
      description="You're committing to finish the work by the deadline. You can message the requester once you accept."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={ui.closeAccept}>
            Not now
          </Button>
          <Button
            variant="lime"
            disabled={!allowed}
            onClick={() => {
              const result = store.acceptTask(task.id);
              if (!result.ok) {
                toast(result.error, "error");
                return;
              }
              if ((task.paymentMethod ?? "stripe_card") === "stripe_card") {
                void createStripeEscrowHold({
                  taskId: task.id,
                  title: task.title,
                  rewardCents: reward,
                  expenseCents: task.expenseCents ?? 0,
                  requesterId: task.requesterId,
                  helperId: user.id,
                  helperAccountId: user.stripeAccountReady ? user.stripeAccountId : undefined,
                }).then((intent) => {
                  if (intent.ok && intent.paymentIntentId) {
                    store.attachStripePaymentIntent(
                      task.id,
                      intent.paymentIntentId,
                      intent.mode ?? "test_fallback",
                      intent.status,
                    );
                  } else {
                    toast("Task accepted, but the card hold could not be created. The requester can retry from the task.", "error");
                  }
                });
              }
              ui.closeAccept();
              toast(
                task.paymentMethod === "cash_handoff"
                  ? `Task accepted. ${formatMoney(reward)} is due in cash at handoff.`
                  : `Task accepted. ${formatMoney(reward + (task.expenseCents ?? 0))} card hold set up for the requester.`,
                "success",
              );
              ui.openTask(task.id);
            }}
          >
            Accept for {formatMoney(reward)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold leading-snug text-ink">{task.title}</p>
              <p className="mt-1 text-xs text-muted">
                {requester?.name ?? "Requester"} ·{" "}
                {task.category === "delivery" ? "Pickup & delivery" : "Task"}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-2xl font-semibold tracking-tight text-ink">
                {formatMoney(reward)}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                {task.paymentMethod === "cash_handoff" ? "Cash at Handoff" : "Stripe Card Hold"}
              </p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-line pt-3 text-xs sm:grid-cols-2">
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
              <div>
                <dt className="sr-only">Location</dt>
                <dd className="font-medium text-ink">{taskPickup(task).label}</dd>
                {taskDropoff(task) ? (
                  <dd className="text-muted">→ {taskDropoff(task)!.label}</dd>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
              <div>
                <dt className="sr-only">Deadline</dt>
                <dd className="font-medium text-ink">{formatDeadline(task.deadline)}</dd>
                <dd className="flex items-center gap-1 text-muted">
                  <Clock3 className="size-3" aria-hidden />~{task.estimatedMinutes} min task
                </dd>
              </div>
            </div>
          </dl>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
            <div className="flex items-center justify-between text-muted">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                {task.paymentMethod === "cash_handoff" ? (
                  <>
                    <Banknote className="size-3.5 text-[#587d2a]" aria-hidden />
                    Cash at Handoff
                  </>
                ) : (
                  <>
                    <CreditCard className="size-3.5 text-[#587d2a]" aria-hidden />
                    Stripe Card Escrow
                  </>
                )}
              </span>
              <span className="tabular font-semibold text-ink">
                {formatMoney(reward + (task.expenseCents ?? 0))} total
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>Task reward</span>
              <span className="tabular">{formatMoney(reward)}</span>
            </div>
            {task.expenseCents ? (
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Expense reimbursement</span>
                <span className="tabular">up to {formatMoney(task.expenseCents)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>Campus platform fee</span>
              <span className="tabular font-medium text-[#587d2a]">$0.00</span>
            </div>
          </div>
        </div>

        {requester ? (
          <div className="flex items-center gap-3 rounded-xl bg-muted-surface p-3">
            <Avatar
              name={requester.name}
              initials={requester.initials}
              color={requester.avatarColor}
              size="sm"
              verified={requester.verified}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">{requester.name}</p>
              <p className="text-[11px] text-muted">
                {requesterStats?.rating
                  ? `${requesterStats.rating.toFixed(1)}★ from ${requesterStats.ratingCount} ${requesterStats.ratingCount === 1 ? "review" : "reviews"}`
                  : "No reviews yet"}
              </p>
            </div>
            <StatusBadge status={task.status} />
          </div>
        ) : null}

        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface p-3 text-[11px] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#587d2a]" aria-hidden />
          <p>
            Meet in a permitted public place, keep private details private, and only take on work
            you can safely finish.
          </p>
        </div>

        {!allowed ? (
          <p className="text-xs font-medium text-danger" role="alert">
            This task can no longer be accepted. It may be claimed, past its deadline, or your own.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
