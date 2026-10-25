"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, BellRing, CheckCheck, SlidersHorizontal } from "lucide-react";
import type { Notification } from "@/types";
import { useDemo, useUi } from "@/components/providers";
import { getNotifications, getTask, unreadCount } from "@/features/selectors";
import { formatRelative, startOfDay } from "@/lib/time";
import { Button, EmptyState, cn, useToast } from "@/components/ui";
import { NOTIFICATION_ICONS } from "@/components/icons";
import {
  disablePush,
  enablePush,
  getPushStatus,
  type PushStatus,
} from "@/lib/push-client";

const TONE_BY_KIND: Partial<Record<Notification["kind"], string>> = {
  MATCH: "bg-lime-soft text-[#4d6528]",
  MESSAGE: "bg-muted-surface text-ink",
  PAYMENT: "bg-success-soft text-success",
  TASK_COMPLETED: "bg-success-soft text-success",
  TASK_READY: "bg-[#eaf2fb] text-[#2d5377]",
  OFFER_RECEIVED: "bg-warning-soft text-warning",
  OFFER_ACCEPTED: "bg-lime-soft text-[#4d6528]",
  OFFER_REJECTED: "bg-muted-surface text-muted",
  TASK_CANCELLED: "bg-danger-soft text-danger",
  DEADLINE_SOON: "bg-warning-soft text-warning",
  TASK_ACCEPTED: "bg-[#eaf2fb] text-[#2d5377]",
  SYSTEM: "bg-muted-surface text-muted",
};

export function NotificationsView() {
  const { state, user, store } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const notifications = getNotifications(state, user.id);
  const unread = unreadCount(state, user.id);
  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  useEffect(() => {
    let active = true;
    getPushStatus().then((status) => {
      if (active) setPushStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushStatus?.state === "subscribed") {
        await disablePush();
        setPushStatus(await getPushStatus());
        toast("Browser push turned off. In-app updates still arrive.", "default");
      } else {
        const result = await enablePush();
        if (!result.ok) {
          toast(result.error ?? "Push couldn't be enabled.", "error");
          setPushStatus(await getPushStatus());
          return;
        }
        setPushStatus(await getPushStatus());
        toast("Browser push enabled for this device.", "success");
      }
    } finally {
      setPushBusy(false);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const item of visible) {
      const label = dayLabel(item.createdAt);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
            In-app updates
          </div>
          <h1 className="mt-2 text-[30px] font-semibold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[38px]">
            Notifications
          </h1>
          <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted">
            {unread > 0
              ? `${unread} unread ${unread === 1 ? "update" : "updates"} about your tasks and matches.`
              : "You're all caught up. New offers, messages and matches will appear here."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              store.markAllNotificationsRead();
              toast("All notifications marked as read.", "success");
            }}
            disabled={unread === 0}
          >
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-lime-soft text-[#4d6528]">
            <BellRing className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[12.5px] font-semibold text-ink">Browser push</p>
            <p className="mt-0.5 max-w-md text-[10.5px] leading-relaxed text-muted">
              {pushStatus?.detail ?? "Checking push support…"} Quiet hours and match notifications
              are respected; the service worker only shows a push when the tab is in the background.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={pushStatus?.state === "subscribed" ? "outline" : "lime"}
          onClick={togglePush}
          disabled={
            pushBusy ||
            !pushStatus ||
            pushStatus.state === "unsupported" ||
            pushStatus.state === "unconfigured" ||
            pushStatus.state === "denied"
          }
          className="shrink-0 self-start sm:self-auto"
        >
          {pushBusy
            ? "Working…"
            : pushStatus?.state === "subscribed"
              ? "Turn off push"
              : "Enable push"}
        </Button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
          {(
            [
              { value: "all", label: `All ${notifications.length}` },
              { value: "unread", label: `Unread ${unread}` },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors",
                filter === option.value
                  ? "bg-ink text-white"
                  : "text-muted hover:bg-muted-surface hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Notification preferences
        </Link>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" aria-hidden />}
          title={filter === "unread" ? "No unread notifications" : "Nothing here yet"}
          description={
            filter === "unread"
              ? "Everything has been read. Switch to All to review earlier updates."
              : "Post a task, make an offer, or message a helper and updates will show up here."
          }
          action={
            filter === "unread" ? (
              <Button variant="outline" onClick={() => setFilter("all")}>
                View all notifications
              </Button>
            ) : (
              <Link
                href="/discover"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-lime px-5 text-sm font-semibold text-ink"
              >
                Explore Discover
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([label, items]) => (
            <section key={label} aria-label={label}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {label}
                </h2>
                <span className="h-px flex-1 bg-line" aria-hidden />
              </div>
              <ul className="space-y-2">
                {items.map((item) => {
                  const Icon = NOTIFICATION_ICONS[item.kind] ?? Bell;
                  const tone = TONE_BY_KIND[item.kind] ?? "bg-muted-surface text-muted";
                  const task = getTask(state, item.taskId);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          store.markNotificationRead(item.id);
                          if (item.taskId) ui.openTask(item.taskId);
                        }}
                        className={cn(
                          "group relative flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors sm:p-4",
                          item.read
                            ? "border-line bg-surface hover:border-[#d4d8cd]"
                            : "border-[#e3f2b5] bg-[#fbfdf4] hover:border-[#cfdf9e]",
                        )}
                        aria-label={`${item.read ? "" : "Unread. "}${item.title}. ${item.body}${task ? ` Open ${task.title}.` : ""}`}
                      >
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone)}>
                          <Icon className="size-4" strokeWidth={1.9} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span
                              className={cn(
                                "text-[12.5px] leading-snug",
                                item.read ? "font-medium text-ink" : "font-semibold text-ink",
                              )}
                            >
                              {item.title}
                            </span>
                            <span className="shrink-0 text-[9.5px] text-muted">
                              {formatRelative(item.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
                            {item.body}
                          </span>
                          {task ? (
                            <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-[#587d2a]">
                              {task.title}
                              <ArrowRight className="size-3" aria-hidden />
                            </span>
                          ) : null}
                        </span>
                        {!item.read ? (
                          <span
                            className="absolute right-3 top-3 size-1.5 rounded-full bg-[#8fb32e]"
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11.5px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">Personal, not noisy.</span> Match updates only
            fire when a task clears your preferences, quiet hours and the match threshold. You are
            never notified about your own actions.
          </p>
          <Link
            href="/profile"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            Adjust match settings
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted">
        DEMO MODE · Notifications are stored in this browser, not sent as push or SMS.
      </p>
    </div>
  );
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = startOfDay(now).getTime();
  const target = startOfDay(date).getTime();
  const diff = Math.round((today - target) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Earlier";
}
