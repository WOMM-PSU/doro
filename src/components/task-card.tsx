"use client";

import {
  BadgeCheck,
  CalendarDays,
  Clock3,
  MapPin,
  Navigation,
  Sparkles,
  Star,
} from "lucide-react";
import type { User } from "@/types";
import { getUserStats, type RankedTask } from "@/features/selectors";
import { getLocation } from "@/lib/locations";
import { CATEGORY_LABELS } from "@/features/matching";
import { formatDeadline, formatShortDeadline } from "@/lib/time";
import { formatMiles, formatMoney, formatTravel } from "@/lib/format";
import { useDemo, useUi } from "@/components/providers";
import { Avatar, Button, Money, Pill, cn } from "@/components/ui";
import { CATEGORY_ICONS } from "@/components/icons";

export function TaskCard({
  ranked,
  rank,
  mode,
  selected,
  onSelect,
  requester,
}: {
  ranked: RankedTask;
  rank: number;
  mode: string;
  selected?: boolean;
  onSelect?: (taskId: string) => void;
  requester?: User;
}) {
  const { task, match, distanceMiles, travelMinutes, minutesLeft } = ranked;
  const { state, user } = useDemo();
  const ui = useUi();
  const category = CATEGORY_LABELS[task.category];
  const Icon = CATEGORY_ICONS[task.category];
  const isOwn = task.requesterId === user.id;
  const urgent = minutesLeft > 0 && minutesLeft <= 180;
  const pickup = getLocation(task.locationId);
  const dropoff = task.dropoffLocationId ? getLocation(task.dropoffLocationId) : undefined;
  const travelMode = user.preferences.travelMode;
  const totalMinutes = task.estimatedMinutes + travelMinutes;
  const bestMatch = mode === "foryou" && rank === 0 && match.score >= 70;
  const requesterRating = requester ? getUserStats(state, requester).rating : null;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-2xl border bg-surface p-4 transition-all duration-200 sm:p-5",
        selected
          ? "border-ink ring-1 ring-ink/80"
          : "border-line hover:-translate-y-0.5 hover:border-[#d4d8cd] hover:shadow-soft",
      )}
      aria-label={`${task.title}, ${task.rewardCents / 100} dollars`}
    >
      <button
        type="button"
        onClick={() => {
          onSelect?.(task.id);
          ui.openTask(task.id);
        }}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        aria-label={`View details for ${task.title}`}
      />

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted-surface text-ink">
              <Icon className="size-4" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {category}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {urgent ? (
              <Pill tone="warning" className="tabular">
                <Clock3 className="size-3" aria-hidden />
                {formatShortDeadline(task.deadline)}
              </Pill>
            ) : null}
            {bestMatch ? (
              <Pill tone="lime" className="hidden min-[380px]:inline-flex">
                <Sparkles className="size-3" aria-hidden />
                Best match
              </Pill>
            ) : (
              <span className="tabular rounded-full bg-[#f4f6ef] px-2 py-1 text-[10px] font-semibold text-[#57702a]">
                {match.score}% match
              </span>
            )}
          </div>
        </div>

        <h3 className="mt-3 text-[16px] font-semibold leading-snug text-ink">{task.title}</h3>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{task.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {dropoff ? `${pickup.shortLabel} → ${dropoff.shortLabel}` : pickup.shortLabel}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Navigation className="size-3.5" aria-hidden />
            {formatMiles(distanceMiles)} · {formatTravel(travelMinutes, travelMode)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden />
            ~{totalMinutes} min total
          </span>
        </div>

        {!urgent ? (
          <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted">
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDeadline(task.deadline)}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[#f7faf0] px-2.5 py-1.5 text-[11px] leading-snug text-[#4d6528]">
          <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">
            {match.explanation[0]}
            {match.explanation[1] ? ` · ${match.explanation[1]}` : ""}
          </span>
        </div>
      </div>

      <div className="relative z-20 mt-4 flex items-end justify-between gap-3 border-t border-line pt-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <Money cents={task.rewardCents} size="lg" />
            <span className="text-[10.5px] font-medium text-muted">
              {task.acceptanceMode === "offers" ? "or make an offer" : "fixed reward"}
              {task.paymentMethod === "cash_handoff" ? " · cash" : ""}
            </span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            {requester ? (
              <>
                <Avatar
                  name={requester.name}
                  initials={requester.initials}
                  color={requester.avatarColor}
                  size="xs"
                />
                <span className="truncate text-[11px] font-medium text-ink">
                  {requester.name.split(" ")[0]}
                </span>
                {requester.verified ? (
                  <BadgeCheck className="size-3.5 shrink-0 text-[#587d2a]" aria-label="Verified" />
                ) : null}
                {requesterRating !== null ? (
                  <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted">
                    <Star className="size-3 fill-[#1d1f23] text-[#1d1f23]" aria-hidden />
                    {requesterRating.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted">New</span>
                )}
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isOwn ? (
            <Button size="sm" variant="outline" onClick={() => ui.openTask(task.id)}>
              Manage
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onSelect?.(task.id);
                  ui.openTask(task.id);
                }}
              >
                View
              </Button>
              {task.acceptanceMode === "fixed" ? (
                <Button
                  size="sm"
                  variant="lime"
                  onClick={() => ui.openAccept(task.id)}
                  className="whitespace-nowrap"
                >
                  Accept · {formatMoney(task.rewardCents, { compact: true })}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="lime"
                  onClick={() => {
                    onSelect?.(task.id);
                    ui.openTask(task.id);
                  }}
                  className="whitespace-nowrap"
                >
                  Make an offer
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
