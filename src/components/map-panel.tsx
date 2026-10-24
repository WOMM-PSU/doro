"use client";

import { MapPin } from "lucide-react";
import type { RankedTask } from "@/features/selectors";
import { getLocation, mapPosition } from "@/lib/locations";
import { formatMoney } from "@/lib/format";
import { cn } from "@/components/ui";

export function MapPanel({
  tasks,
  selectedId,
  onSelect,
  onOpen,
  compact,
}: {
  tasks: RankedTask[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  onOpen: (taskId: string) => void;
  compact?: boolean;
}) {
  const byLocation = new Map<string, RankedTask[]>();
  for (const ranked of tasks) {
    const list = byLocation.get(ranked.task.locationId) ?? [];
    list.push(ranked);
    byLocation.set(ranked.task.locationId, list);
  }

  const pinOffsets = [
    { x: 0, y: 0 },
    { x: 16, y: -8 },
    { x: -16, y: -6 },
    { x: 8, y: 14 },
    { x: -10, y: 16 },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative">
        <div
          className={cn(
            "map-surface relative w-full overflow-hidden",
            compact ? "aspect-[4/3]" : "aspect-[5/4]",
          )}
          role="img"
          aria-label="Schematic demo map of approximate campus task locations"
        >
          <svg viewBox="0 0 100 80" className="absolute inset-0 size-full" aria-hidden preserveAspectRatio="none">
            <path className="map-green" d="M2 58 C18 48, 28 58, 38 50 C48 42, 52 26, 70 22 C84 18, 92 24, 99 20 L99 79 L2 79 Z" />
            <path className="map-road" d="M-4 60 C16 56, 30 48, 48 44 C64 40, 80 30, 104 26" />
            <path className="map-road" d="M18 82 C26 64, 38 54, 46 40 C54 26, 58 14, 62 -4" />
            <path className="map-road" d="M86 82 C80 64, 70 52, 66 38 C62 26, 66 14, 70 -4" />
            <path className="map-road opacity-70" d="M-4 34 C14 32, 28 28, 44 28 C62 28, 78 34, 104 32" />
            <circle cx="46" cy="39" r="8.5" fill="rgba(255,255,255,0.5)" />
            <text x="46" y="55" textAnchor="middle" fontSize="3" fill="#6a7163">
              campus core
            </text>
          </svg>

          {["hub", "pattee", "west-halls", "east-halls", "pollock-halls", "downtown"].map((id) => {
            const location = getLocation(id);
            const { x, y } = mapPosition(location);
            return (
              <span
                key={id}
                className="pointer-events-none absolute -translate-x-1/2 translate-y-3 whitespace-nowrap text-[8px] font-medium uppercase tracking-wide text-[#7c8375] sm:text-[9px]"
                style={{ left: `${x}%`, top: `${y}%` }}
                aria-hidden
              >
                {location.shortLabel}
              </span>
            );
          })}

          {Array.from(byLocation.entries()).flatMap(([locationId, group]) => {
            const base = mapPosition(getLocation(locationId));
            return group.slice(0, 5).map((ranked, index) => {
              const offset = pinOffsets[index] ?? { x: 0, y: 0 };
              const selected = ranked.task.id === selectedId;
              return (
                <button
                  key={ranked.task.id}
                  type="button"
                  onClick={() => {
                    onSelect(ranked.task.id);
                    onOpen(ranked.task.id);
                  }}
                  aria-label={`Open ${ranked.task.title}, ${formatMoney(ranked.task.rewardCents)}`}
                  className={cn(
                    "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold shadow-soft transition-all",
                    selected
                      ? "z-20 scale-110 border-ink bg-ink text-lime"
                      : "border-white bg-surface text-ink hover:scale-105 hover:border-ink",
                  )}
                  style={{
                    left: `calc(${base.x}% + ${offset.x}px)`,
                    top: `calc(${base.y}% + ${offset.y}px)`,
                  }}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      selected ? "bg-lime" : "bg-[#a6c43f]",
                      !selected && index === 0 ? "pulse-marker" : "",
                    )}
                    aria-hidden
                  />
                  {formatMoney(ranked.task.rewardCents, { compact: true })}
                </button>
              );
            });
          })}

          {tasks.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#eef1e9]/80 px-6 text-center">
              <MapPin className="size-6 text-muted" aria-hidden />
              <p className="text-sm font-medium text-ink">No pins with these filters</p>
              <p className="text-xs text-muted">Clear filters to see nearby tasks again.</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
            {tasks.length} open {tasks.length === 1 ? "task" : "tasks"}
          </span>
          <span className="text-[10px] text-muted">Approximate demo locations · not to scale</span>
        </div>
      </div>
    </div>
  );
}
