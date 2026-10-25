"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  ClipboardList,
  Clock3,
  MapPin,
  Sparkles,
  Star,
} from "lucide-react";
import type { DemoState, Task, User } from "@/types";
import { useDemo, useUi } from "@/components/providers";
import { DEMO_MODE } from "@/lib/demo-mode";
import {
  canReviewTask,
  effectiveStatus,
  getCounterpart,
  getEvents,
  getPendingOffers,
  taskLocationLabel,
  getNeedsAction,
  isOverdue,
  getUser,
  getUserStats,
  nextActivityHint,
} from "@/features/selectors";
import { CATEGORY_LABELS } from "@/features/matching";
import { formatMoney } from "@/lib/format";
import { paymentLabels } from "@/lib/payment-labels";
import { formatDeadline, formatRelative } from "@/lib/time";
import {
  Avatar,
  Button,
  EmptyState,
  Money,
  Pill,
  StatusBadge,
  cn,
} from "@/components/ui";
import { CATEGORY_ICONS } from "@/components/icons";

type TabValue = "needs" | "posted" | "accepted" | "progress" | "completed" | "cancelled";

const TABS: { value: TabValue; label: string }[] = [
  { value: "needs", label: "Needs you" },
  { value: "posted", label: "Posted" },
  { value: "accepted", label: "Accepted" },
  { value: "progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ACTIVE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION"];

export function ActivityView() {
  const { state, user } = useDemo();
  const ui = useUi();
  const [tab, setTab] = useState<TabValue>("needs");

  useEffect(() => {
    setTab("needs");
  }, [user.id]);

  const tasksFor = useMemo(() => {
    const isParticipant = (task: Task) =>
      task.requesterId === user.id || task.helperId === user.id;

    const needs = getNeedsAction(state, user);
    const posted = state.tasks
      .filter((task) => task.requesterId === user.id && ACTIVE_STATUSES.includes(effectiveStatus(task)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const accepted = state.tasks
      .filter(
        (task) =>
          task.helperId === user.id &&
          ["ASSIGNED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(task.status),
      )
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    const progress = state.tasks
      .filter((task) => isParticipant(task) && task.status === "IN_PROGRESS")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const completed = state.tasks
      .filter((task) => isParticipant(task) && task.status === "COMPLETED")
      .sort(
        (a, b) =>
          new Date(b.completedAt ?? b.updatedAt).getTime() -
          new Date(a.completedAt ?? a.updatedAt).getTime(),
      );
    const cancelled = state.tasks
      .filter(
        (task) =>
          isParticipant(task) && ["CANCELLED", "EXPIRED"].includes(effectiveStatus(task)),
      )
      .sort(
        (a, b) =>
          new Date(b.cancelledAt ?? b.updatedAt).getTime() -
          new Date(a.cancelledAt ?? a.updatedAt).getTime(),
      );
    return { needs, posted, accepted, progress, completed, cancelled } as const;
  }, [state, user]);

  const counts: Record<TabValue, number> = {
    needs: tasksFor.needs.length,
    posted: tasksFor.posted.length,
    accepted: tasksFor.accepted.length,
    progress: tasksFor.progress.length,
    completed: tasksFor.completed.length,
    cancelled: tasksFor.cancelled.length,
  };

  const tasks = tasksFor[tab];
  const stats = getUserStats(state, user);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
          Your tasks
        </div>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[38px]">
          My activity
        </h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted">
          Everything you posted or accepted, with the next useful action in each state.
          {counts.needs > 0 ? (
            <span className="font-medium text-ink">
              {" "}
              {counts.needs} {counts.needs === 1 ? "task needs" : "tasks need"} you.
            </span>
          ) : (
            " Nothing needs you right now."
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={tab === item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-colors",
                tab === item.value
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-muted hover:border-[#cfd3c9] hover:text-ink",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold",
                  tab === item.value ? "bg-white/15 text-white" : "bg-muted-surface text-muted",
                )}
              >
                {counts[item.value]}
              </span>
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-1.5 text-[10.5px] text-muted sm:flex">
          <Banknote className="size-3.5" aria-hidden />
          Demo ledger · simulated money only
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" aria-hidden />}
          title={emptyTitle(tab)}
          description={emptyDescription(tab)}
          action={
            <Link
              href="/discover"
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink hover:bg-muted-surface"
            >
              Explore nearby tasks
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <ActivityRow key={task.id} task={task} state={state} user={user} />
          ))}
        </div>
      )}

      {tab === "completed" && tasks.length > 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[12px] font-semibold text-ink">Your track record</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {stats.completedAsHelper} completed as a helper ·{" "}
                {stats.rating ? `${stats.rating.toFixed(1)}★ from ${stats.ratingCount} reviews` : "no reviews yet"} ·{" "}
                {stats.completionRate !== null
                  ? `${Math.round(stats.completionRate * 100)}% completion rate`
                  : "new helper"}
              </p>
            </div>
            {stats.isNew ? (
              <Pill tone="lime">
                <Sparkles className="size-3" aria-hidden />
                New helper
              </Pill>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="text-center text-[10px] text-muted">
        {DEMO_MODE
          ? "DEMO MODE · Simulated payments and sample data. Resetting restores everything."
          : "Payment states are recorded per task. Contact the other person if something looks wrong."}
      </p>
    </div>
  );
}

function emptyTitle(tab: TabValue): string {
  switch (tab) {
    case "needs":
      return "Nothing needs you right now";
    case "posted":
      return "Nothing on your plate yet";
    case "accepted":
      return "No accepted tasks";
    case "progress":
      return "Nothing in progress";
    case "completed":
      return "No completed tasks yet";
    case "cancelled":
      return "No cancelled tasks";
  }
}

function emptyDescription(tab: TabValue): string {
  switch (tab) {
    case "needs":
      return "When a helper accepts, makes an offer, or marks work ready, it will show up here.";
    case "posted":
      return "Post a request when you need a hand, or explore nearby tasks to earn a little money.";
    case "accepted":
      return "Explore Discover, accept a task that fits your route and time, and it will appear here.";
    case "progress":
      return "Started work will show up here with messaging and completion controls.";
    case "completed":
      return "Finish a task and confirm it to build a visible history of help.";
    case "cancelled":
      return "Cancelled or expired tasks stay here for a complete, honest history.";
  }
}

function ActivityRow({ task, state, user }: { task: Task; state: DemoState; user: User }) {
  const ui = useUi();
  const Icon = CATEGORY_ICONS[task.category];
  const isRequester = task.requesterId === user.id;
  const counterpart = getUser(state, getCounterpart(task, user) ?? "");
  const status = effectiveStatus(task);
  const payment = state.payments.find((p) => p.taskId === task.id);
  const offers = isRequester ? getPendingOffers(state, task.id).length : 0;
  const latest = getEvents(state, task.id)[0];
  const hint = nextActivityHint(state, task, user);
  const reviewable = canReviewTask(state, task, user);
  const roleLabel = isRequester ? "You posted" : "You're helping";
  const reward = task.agreedRewardCents ?? task.rewardCents;

  return (
    <article className="group relative rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[#d4d8cd]">
      <button
        type="button"
        onClick={() => ui.openTask(task.id)}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        aria-label={`Open ${task.title}`}
      />
      <div className="pointer-events-none relative z-10 flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted-surface text-ink">
          <Icon className="size-4" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={status} />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              {roleLabel}
            </span>
            {isOverdue(task) ? (
              <Pill tone="warning">
                <Clock3 className="size-2.5" aria-hidden />
                Overdue
              </Pill>
            ) : null}
            {offers > 0 ? (
              <Pill tone="lime">
                {offers} {offers === 1 ? "offer" : "offers"}
              </Pill>
            ) : null}
            {reviewable ? (
              <Pill tone="success">
                <Star className="size-2.5" aria-hidden />
                Review ready
              </Pill>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-[15px] font-semibold leading-snug text-ink">{task.title}</h2>
            <div className="shrink-0 text-right">
              <Money cents={reward} size="md" />
              <p className="text-[9px] text-muted">
                {task.agreedRewardCents ? "agreed" : "listed"}
              </p>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {taskLocationLabel(task)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" aria-hidden />
              {formatDeadline(task.deadline)}
            </span>
            <span>{CATEGORY_LABELS[task.category]}</span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-[#4d6528]">
            <span className="mt-[5px] size-1 shrink-0 rounded-full bg-[#a6c43f]" aria-hidden />
            {hint}
            {latest ? (
              <span className="font-normal text-muted"> · {formatRelative(latest.createdAt)}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {counterpart ? (
            <>
              <Avatar
                name={counterpart.name}
                initials={counterpart.initials}
                color={counterpart.avatarColor}
                size="xs"
              />
              <span className="truncate text-[10.5px] text-muted">
                {isRequester ? "Helper" : "Requester"}:{" "}
                <span className="font-medium text-ink">{counterpart.name}</span>
              </span>
            </>
          ) : (
            <span className="text-[10.5px] text-muted">
              {isRequester ? "No helper yet" : "No requester"}
            </span>
          )}
          {payment ? (
            <span className="ml-1 hidden rounded-full bg-muted-surface px-1.5 py-0.5 text-[9px] font-medium text-muted sm:inline">
              {paymentLabels({ state: payment.state, paymentMethod: payment.paymentMethod ?? task.paymentMethod }).status}
            </span>
          ) : null}
        </div>
        <div className="pointer-events-auto">
          <Button size="sm" variant={reviewable ? "lime" : "outline"} onClick={() => ui.openTask(task.id)}>
            {reviewable ? "Leave a review" : "Open task"}
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}
