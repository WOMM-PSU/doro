"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bike,
  Bus,
  Car,
  Check,
  CheckCircle2,
  Cloud,
  Clock3,
  Flag,
  Footprints,
  MapPin,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { UserPreferences } from "@/types";
import { useDemo, useUi } from "@/components/providers";
import {
  getPaymentHistory,
  getTask,
  getUser,
  getUserStats,
} from "@/features/selectors";
import { getLocation } from "@/lib/locations";
import { CATEGORY_LABELS } from "@/features/matching";
import { formatMoney } from "@/lib/format";
import { paymentLabels } from "@/lib/payment-labels";
import { formatRelative } from "@/lib/time";
import {
  Avatar,
  Button,
  Checkbox,
  Modal,
  Pill,
  SegmentedControl,
  Stars,
  cn,
  useToast,
} from "@/components/ui";
import { CATEGORY_ICONS } from "@/components/icons";
import { ConnectPayouts } from "@/components/connect-payouts";
import { DEMO_MODE } from "@/lib/demo-mode";

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];

export function ProfileView() {
  const { state, user, store } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const [draft, setDraft] = useState<UserPreferences>(user.preferences);
  const [resetOpen, setResetOpen] = useState(false);
  const [syncInfo, setSyncInfo] = useState(() => store.getSyncInfo());
  const stats = getUserStats(state, user);
  const payments = getPaymentHistory(state, user.id).slice(0, 5);
  const reports = useMemo(
    () =>
      [...state.reports].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [state.reports],
  );
  const openReports = reports.filter((r) => r.status === "OPEN").length;
  const canModerate = user.id === "u-maya" || user.id === "u-jordan";

  useEffect(() => {
    setDraft(user.preferences);
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSyncInfo(store.getSyncInfo());
    return store.onSyncInfo(setSyncInfo);
  }, [store]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(user.preferences);
  const router = useRouter();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  // Unsaved preferences: confirm before following an in-app link, and let the
  // browser warn before the tab closes or reloads.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  const toggleCategory = (category: keyof typeof CATEGORY_LABELS) => {
    const has = draft.categories.includes(category);
    if (has && draft.categories.length === 1) {
      toast("Keep at least one preferred category.", "error");
      return;
    }
    setDraft((current) => ({
      ...current,
      categories: has
        ? current.categories.filter((c) => c !== category)
        : [...current.categories, category],
    }));
  };

  const savePreferences = () => {
    const result = store.updatePreferences(draft);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Preferences saved. Discovery and match notifications now use them.", "success");
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
          Your account
        </div>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[38px]">
          Profile
        </h1>
      </header>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="h-20 bg-gradient-to-r from-[#e9eede] via-[#f1f7dc] to-[#dff3a8]" />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="-mt-8 flex flex-wrap items-end justify-between gap-3">
            <Avatar
              name={user.name}
              initials={user.initials}
              color={user.avatarColor}
              size="xl"
              verified={user.verified}
              className="ring-4 ring-surface"
            />
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {user.verified ? (
                <Pill tone="success">
                  <BadgeCheck className="size-3" aria-hidden />
                  Verified
                </Pill>
              ) : (
                <Pill tone="neutral">Not verified</Pill>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[22px] font-semibold tracking-tight text-ink">{user.name}</h2>
                <span className="text-[12px] text-muted">@{user.handle}</span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden />
                  {getLocation(user.homeLocationId).shortLabel} area
                </span>
                <span aria-hidden>·</span>
                {user.joinedLabel}
                <span aria-hidden>·</span>
                {user.role === "requester"
                  ? "Usually requests"
                  : user.role === "helper"
                    ? "Usually helps"
                    : "Requests & helps"}
              </p>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted">{user.bio}</p>
            </div>
            {DEMO_MODE ? (
              <button
                type="button"
                onClick={ui.openPersona}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12px] font-medium text-ink hover:bg-muted-surface"
              >
                <Users className="size-3.5" aria-hidden />
                Switch persona
              </button>
            ) : null}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
            <Stat label="Completed" value={String(stats.completedAsHelper)} hint="as a helper" />
            <Stat label="Posted" value={String(stats.posted)} hint="all time" />
            <Stat
              label="Completion"
              value={stats.completionRate !== null ? `${Math.round(stats.completionRate * 100)}%` : "New"}
              hint={stats.isNew ? "first tasks" : "helper rate"}
            />
            <div className="rounded-xl bg-[#fbfcf9] px-3 py-2.5">
              <dt className="text-[9.5px] font-medium uppercase tracking-wide text-muted">Rating</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {stats.rating ? (
                  <>
                    <span className="tabular text-[17px] font-semibold text-ink">
                      {stats.rating.toFixed(1)}
                    </span>
                    <Stars value={stats.rating} size={11} />
                    <span className="text-[9px] text-muted">({stats.ratingCount})</span>
                  </>
                ) : (
                  <span className="text-[13px] font-semibold text-ink">New</span>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            Based on tasks completed and ratings received.
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">Discovery preferences</h2>
                <p className="mt-0.5 max-w-md text-[11.5px] leading-relaxed text-muted">
                  Used to rank tasks and send match notifications.
                </p>
              </div>
              {dirty ? (
                <Pill tone="warning">
                  <span className="size-1.5 rounded-full bg-[#c99a2e]" aria-hidden />
                  Unsaved changes
                </Pill>
              ) : (
                <Pill tone="success">
                  <Check className="size-3" aria-hidden />
                  Saved
                </Pill>
              )}
            </div>

            <div className="mt-4 space-y-5">
              <div>
                <p className="text-[12px] font-semibold text-ink">Categories you want</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ALL_CATEGORIES.map((category) => {
                    const Icon = CATEGORY_ICONS[category];
                    const selected = draft.categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleCategory(category)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-surface text-muted hover:border-[#cfd3c9] hover:text-ink",
                        )}
                      >
                        <Icon className="size-3" aria-hidden />
                        {CATEGORY_LABELS[category]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="pref-reward" className="text-[12px] font-semibold text-ink">
                      Minimum reward
                    </label>
                    <span className="tabular text-[12px] font-semibold text-ink">
                      {formatMoney(draft.minRewardCents)}
                    </span>
                  </div>
                  <input
                    id="pref-reward"
                    type="range"
                    min={0}
                    max={2000}
                    step={100}
                    value={draft.minRewardCents}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        minRewardCents: Number(e.target.value),
                      }))
                    }
                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-surface accent-[#17191c]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="pref-distance" className="text-[12px] font-semibold text-ink">
                      Discovery radius
                    </label>
                    <span className="tabular text-[12px] font-semibold text-ink">
                      {draft.maxDistanceMiles.toFixed(1)} mi
                    </span>
                  </div>
                  <input
                    id="pref-distance"
                    type="range"
                    min={0.5}
                    max={5}
                    step={0.1}
                    value={draft.maxDistanceMiles}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        maxDistanceMiles: Number(e.target.value),
                      }))
                    }
                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-surface accent-[#17191c]"
                  />
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-ink">Getting around</p>
                <div className="mt-1.5">
                  <SegmentedControl
                    ariaLabel="Travel mode"
                    value={draft.travelMode}
                    onChange={(mode) => setDraft((current) => ({ ...current, travelMode: mode }))}
                    options={[
                      {
                        value: "walk",
                        label: "Walk",
                        icon: <Footprints className="size-3.5" aria-hidden />,
                      },
                      { value: "bike", label: "Bike", icon: <Bike className="size-3.5" aria-hidden /> },
                      { value: "bus", label: "Bus", icon: <Bus className="size-3.5" aria-hidden /> },
                      { value: "car", label: "Car", icon: <Car className="size-3.5" aria-hidden /> },
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-line pt-4">
                <Checkbox
                  checked={draft.prefersScheduled}
                  onChange={(checked) =>
                    setDraft((current) => ({ ...current, prefersScheduled: checked }))
                  }
                  label="I prefer scheduled tasks"
                  description="Short-notice tasks still appear, but they score lower for timing."
                />
                <Checkbox
                  checked={draft.notifyMatches}
                  onChange={(checked) =>
                    setDraft((current) => ({ ...current, notifyMatches: checked }))
                  }
                  label="Notify me about matching tasks"
                  description="Only tasks above the match threshold and your minimum reward, outside quiet hours."
                />
                <div>
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                    <Clock3 className="size-3.5" aria-hidden />
                    Quiet hours
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
                    <label htmlFor="quiet-start" className="sr-only">
                      Quiet hours start
                    </label>
                    <select
                      id="quiet-start"
                      value={draft.quietHours.startHour}
                      onChange={(e) =>
                        setDraft((current) => ({
                          ...current,
                          quietHours: { ...current.quietHours, startHour: Number(e.target.value) },
                        }))
                      }
                      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink"
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {formatHour(hour)}
                        </option>
                      ))}
                    </select>
                    <span>to</span>
                    <label htmlFor="quiet-end" className="sr-only">
                      Quiet hours end
                    </label>
                    <select
                      id="quiet-end"
                      value={draft.quietHours.endHour}
                      onChange={(e) =>
                        setDraft((current) => ({
                          ...current,
                          quietHours: { ...current.quietHours, endHour: Number(e.target.value) },
                        }))
                      }
                      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink"
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {formatHour(hour)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    Match notifications are suppressed in this window, in your local time.
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-ink">Skills</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {user.preferences.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-muted-surface px-2 py-1 text-[10.5px] font-medium capitalize text-muted"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted">
                  Skills feed the skills component of Doro Match.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!dirty}
                  onClick={() => setDraft(user.preferences)}
                >
                  Discard changes
                </Button>
                <Button variant="dark" size="sm" onClick={savePreferences} disabled={!dirty}>
                  <Check className="size-3.5" aria-hidden />
                  Save preferences
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Reviews received</h2>
              <span className="text-[10.5px] text-muted">
                {stats.ratingCount} total · {stats.reviews.length} in this demo window
              </span>
            </div>
            {renderReviews()}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink">Reputation</h2>
            <div className="mt-2.5 flex items-center gap-2">
              {stats.rating ? (
                <>
                  <span className="tabular text-3xl font-semibold tracking-tight text-ink">
                    {stats.rating.toFixed(1)}
                  </span>
                  <div>
                    <Stars value={stats.rating} size={13} />
                    <p className="mt-0.5 text-[10px] text-muted">{stats.ratingCount} ratings</p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-base font-semibold text-ink">New helper</p>
                  <p className="text-[10px] text-muted">
                    No reviews yet. New helpers still get fair matches.
                  </p>
                </div>
              )}
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Tasks completed</dt>
                <dd className="tabular font-medium text-ink">{stats.completedAsHelper}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Cancelled</dt>
                <dd className="tabular font-medium text-ink">{stats.cancelled}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Disputed</dt>
                <dd className="tabular font-medium text-ink">{stats.disputed}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Completion rate</dt>
                <dd className="tabular font-medium text-ink">
                  {stats.completionRate !== null ? `${Math.round(stats.completionRate * 100)}%` : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted-surface px-2.5 py-2 text-[10px] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
              Unreviewed tasks are never counted as one-star ratings. Identity and safety are not
              guaranteed by a score.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Banknote className="size-3.5" aria-hidden />
                Payment history
              </h2>
              {DEMO_MODE ? <Pill tone="neutral">Simulated</Pill> : null}
            </div>
            {payments.length === 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                No demo ledger entries yet. Accept a task to create one.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-2">
                {payments.map((payment) => {
                  const task = getTask(state, payment.taskId);
                  const earned = payment.helperId === user.id;
                  // Only a completed payout moves money; holds and cash due are pending,
                  // and released holds never moved anything.
                  const settled = payment.state === "DEMO_RELEASED";
                  const released = payment.state === "DEMO_REFUNDED";
                  return (
                    <li key={payment.id} className="rounded-xl border border-line px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-[11px] font-medium text-ink">
                          {task?.title ?? "Task"}
                        </p>
                        <span
                          className={cn(
                            "tabular shrink-0 text-[11px] font-semibold",
                            settled ? "text-ink" : "text-muted",
                            released && "line-through",
                          )}
                        >
                          {settled ? (earned ? "+" : "−") : ""}
                          {formatMoney(payment.totalCents ?? payment.rewardCents + (payment.expenseCents ?? 0))}
                        </span>
                      </div>
                      <p className="mt-0.5 flex items-center justify-between gap-2 text-[9.5px] text-muted">
                        <span>
                          {paymentLabels({ state: payment.state, paymentMethod: payment.paymentMethod ?? task?.paymentMethod }).status}
                          {payment.expenseCents ? ` · incl. up to ${formatMoney(payment.expenseCents)} expenses` : ""}
                        </span>
                        <span>{formatRelative(payment.updatedAt)}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[9.5px] leading-relaxed text-muted">
              No real charge, transfer or bank account is involved. The ledger lives in this browser.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Cloud className="size-3.5" aria-hidden />
                Workspace sync
              </h2>
              <Pill
                tone={
                  syncInfo.status === "synced"
                    ? "success"
                    : syncInfo.status === "offline"
                      ? "danger"
                      : "neutral"
                }
              >
                {syncInfo.status === "synced"
                  ? "Supabase"
                  : syncInfo.status === "connecting"
                    ? "Checking"
                    : syncInfo.status === "offline"
                      ? "Offline"
                      : "This browser"}
              </Pill>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{syncInfo.detail}</p>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-muted">
              Local mode is the default and needs no keys. Supabase is optional: set the server
              keys and run <span className="font-mono">supabase/schema.sql</span>.
            </p>
          </section>

          <ConnectPayouts />

          {DEMO_MODE ? (
          <section id="demo-controls" className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink">Demo controls</h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              Persona switching is a demo tool. It never resets the marketplace.
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {state.users.map((persona) => {
                const personaStats = getUserStats(state, persona);
                const active = persona.id === user.id;
                return (
                  <li key={persona.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (active) return;
                        store.setActiveUser(persona.id);
                        toast(`Viewing Doro as ${persona.name}.`, "success");
                      }}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border p-2 text-left transition-colors",
                        active
                          ? "border-ink bg-[#fbfdf4]"
                          : "border-line hover:border-[#cfd3c9] hover:bg-[#fbfcf9]",
                      )}
                    >
                      <Avatar
                        name={persona.name}
                        initials={persona.initials}
                        color={persona.avatarColor}
                        size="xs"
                        verified={persona.verified}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-medium text-ink">
                          {persona.name}
                        </span>
                        <span className="block text-[9.5px] text-muted">
                          {personaStats.completedAsHelper} completed
                          {personaStats.rating ? ` · ${personaStats.rating.toFixed(1)}★` : " · new"}
                        </span>
                      </span>
                      {active ? (
                        <CheckCircle2 className="size-3.5 text-ink" aria-label="Active persona" />
                      ) : (
                        <ArrowRight className="size-3 text-muted" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 w-full text-danger"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset demo data
            </Button>
          </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Flag className="size-3.5" aria-hidden />
                Moderation queue
              </h2>
              <span className="tabular rounded-full bg-muted-surface px-2 py-0.5 text-[9.5px] font-semibold text-muted">
                {openReports} open
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
              Submitted reports stay in the demo state. Maya and Jordan can mark them reviewed.
            </p>
            {reports.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted">No reports submitted.</p>
            ) : (
              <ul className="mt-2.5 space-y-2">
                {reports.map((report) => {
                  const task = getTask(state, report.taskId);
                  const reporter = getUser(state, report.reporterId);
                  return (
                    <li key={report.id} className="rounded-xl border border-line p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-semibold text-ink">{report.reason}</p>
                        <Pill tone={report.status === "OPEN" ? "warning" : "success"}>
                          {report.status === "OPEN" ? "Open" : "Reviewed"}
                        </Pill>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {task ? task.title : report.subject === "USER" ? "A person" : "Task"} · by{" "}
                        {reporter?.name ?? "someone"} · {formatRelative(report.createdAt)}
                      </p>
                      {report.details ? (
                        <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted">
                          “{report.details}”
                        </p>
                      ) : null}
                      {report.status === "OPEN" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-1.5 h-7 px-2 text-[10px]"
                          disabled={!canModerate}
                          onClick={() => {
                            const result = store.resolveReport(report.id, "REVIEWED");
                            if (!result.ok) return toast(result.error, "error");
                            toast("Report marked reviewed in the demo queue.", "success");
                          }}
                        >
                          Mark reviewed
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {!canModerate ? (
              <p className="mt-2 text-[9.5px] text-muted">
                Switch to Maya or Jordan to use moderation actions.
              </p>
            ) : null}
          </section>

          <div className="rounded-2xl border border-line bg-[#fbfcf9] p-4 text-[10.5px] leading-relaxed text-muted">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <ShieldCheck className="size-3.5 text-[#587d2a]" aria-hidden />
              Privacy note
            </p>
            <p className="mt-1">
              No exact live locations are broadcast. Task locations are approximate campus places,
              and private account information never appears in the public feed.
            </p>
          </div>
        </aside>
      </div>

      <Modal
        open={Boolean(leaveTo)}
        onClose={() => setLeaveTo(null)}
        title="Leave without saving?"
        description="Your preference changes haven't been saved yet."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setLeaveTo(null)}>
              Keep editing
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const target = leaveTo;
                setDraft(user.preferences);
                setLeaveTo(null);
                if (target) router.push(target);
              }}
            >
              Discard changes
            </Button>
            <Button
              variant="dark"
              onClick={() => {
                const target = leaveTo;
                const result = store.updatePreferences(draft);
                if (!result.ok) {
                  setLeaveTo(null);
                  toast(result.error, "error");
                  return;
                }
                setLeaveTo(null);
                toast("Preferences saved.", "success");
                if (target) router.push(target);
              }}
            >
              Save and leave
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          Leaving now drops the changes to your discovery preferences.
        </p>
      </Modal>

      <Modal
        open={DEMO_MODE && resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the demo?"
        description="All tasks, messages, offers, reviews, reports and simulated payments return to the seeded state."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Keep my demo
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.resetDemo();
                setResetOpen(false);
                toast("Demo reset. You're back to the original sample world.", "success");
              }}
            >
              Reset demo
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          The active persona will return to Maya Chen and this page will show Maya's profile. No real
          data is affected.
        </p>
      </Modal>
    </div>
  );

  function renderReviews() {
    const reviews = stats.reviews;
    if (reviews.length === 0) {
      return (
        <div className="mt-3 rounded-xl border border-dashed border-[#d9ddd2] bg-[#fbfcf9] px-3 py-5 text-center">
          <MessageSquare className="mx-auto size-5 text-muted" aria-hidden />
          <p className="mt-1.5 text-[11.5px] font-medium text-ink">No reviews in this demo window</p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
            Complete a task with a seeded partner, then leave or receive a review.
          </p>
        </div>
      );
    }
    return (
      <ul className="mt-3 space-y-2.5">
        {reviews.map((review) => {
          const author = getUser(state, review.authorId);
          const task = getTask(state, review.taskId);
          return (
            <li key={review.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-2.5">
                {author ? (
                  <Avatar
                    name={author.name}
                    initials={author.initials}
                    color={author.avatarColor}
                    size="xs"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-[11.5px] font-semibold text-ink">{author?.name ?? "Someone"}</p>
                    <span className="flex items-center gap-1 text-[9.5px] text-muted">
                      <Stars value={review.rating} size={10} />
                      {formatRelative(review.createdAt)}
                    </span>
                  </div>
                  <p className="text-[9.5px] text-muted">{task?.title}</p>
                  {review.comment ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-ink/80">“{review.comment}”</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-[#fbfcf9] px-3 py-2.5">
      <dt className="text-[9.5px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[17px] font-semibold text-ink">
        {value}
        <span className="ml-1 text-[9px] font-normal text-muted">{hint}</span>
      </dd>
    </div>
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}


