"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  List,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { TaskCategory } from "@/types";
import {
  DEFAULT_FILTERS,
  getDiscoverTasks,
  getUser,
  type DiscoverFilters,
  type DiscoverMode,
} from "@/features/selectors";
import { formatMiles, formatMoney } from "@/lib/format";
import { greeting } from "@/lib/time";
import { useDemo, useUi } from "@/components/providers";
import { TaskCard } from "@/components/task-card";
import { MapPanel } from "@/components/map-panel";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  SegmentedControl,
  cn,
} from "@/components/ui";

const MODES: { value: DiscoverMode; label: string }[] = [
  { value: "foryou", label: "For you" },
  { value: "nearby", label: "Nearby" },
  { value: "reward", label: "Best rewards" },
  { value: "urgent", label: "Urgent" },
];

const CATEGORIES: { value: TaskCategory | "all"; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "delivery", label: "Delivery" },
  { value: "errands", label: "Errands" },
  { value: "tutoring", label: "Tutoring" },
  { value: "tech", label: "Tech help" },
  { value: "moving", label: "Moving" },
  { value: "other", label: "Other" },
];

export function DiscoverView() {
  const { state, user } = useDemo();
  const ui = useUi();
  const [filters, setFilters] = useState<DiscoverFilters>({
    ...DEFAULT_FILTERS,
    maxDistanceMiles: user.preferences.maxDistanceMiles,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedPin, setSelectedPin] = useState<string | null>(null);

  useEffect(() => {
    setFilters({
      ...DEFAULT_FILTERS,
      maxDistanceMiles: user.preferences.maxDistanceMiles,
    });
    setSelectedPin(null);
  }, [user.id, user.preferences.maxDistanceMiles]);

  const ranked = useMemo(
    () => getDiscoverTasks(state, user, filters),
    [state, user, filters],
  );

  useEffect(() => {
    if (selectedPin && !ranked.some((r) => r.task.id === selectedPin)) {
      setSelectedPin(null);
    }
  }, [ranked, selectedPin]);

  // Under the map, the picked pin's task comes first so it is never out of sight.
  const mapList = useMemo(() => {
    const picked = ranked.find((r) => r.task.id === selectedPin);
    return picked ? [picked, ...ranked.filter((r) => r !== picked)] : ranked;
  }, [ranked, selectedPin]);

  const activeFilterCount =
    (filters.category !== "all" ? 1 : 0) +
    (filters.minRewardCents > 0 ? 1 : 0) +
    (filters.maxDistanceMiles < user.preferences.maxDistanceMiles ? 1 : 0) +
    (filters.mode !== "foryou" ? 1 : 0);
  const isDefaultFilters =
    filters.search.trim() === "" &&
    filters.category === "all" &&
    filters.minRewardCents === 0 &&
    filters.maxDistanceMiles >= user.preferences.maxDistanceMiles;

  const resetFilters = () => {
    setFilters({
      ...DEFAULT_FILTERS,
      mode: filters.mode,
      maxDistanceMiles: user.preferences.maxDistanceMiles,
    });
    setSelectedPin(null);
  };

  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
          University Park, PA
        </div>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[38px]">
          {greeting()}, {firstName}.
        </h1>
      </header>

      <section aria-label="Find tasks">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search tasks, places, or categories"
              aria-label="Search tasks"
              className="h-11 rounded-full pl-10 pr-10"
            />
            {filters.search ? (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, search: "" }))}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-muted-surface hover:text-ink"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <Button
            variant="outline"
            className="relative h-11 shrink-0 gap-2 rounded-full px-4"
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 ? (
              <span className="tabular flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-lime">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </div>
      </section>

      <div
        className={cn(
          "grid gap-5",
          view === "list" && "xl:grid-cols-[minmax(0,1fr)_368px]",
        )}
      >
        <section aria-label="Task feed" className="min-w-0">
          {view === "map" ? (
            <div>
              <MapPanel
                tasks={ranked}
                selectedId={selectedPin}
                onSelect={setSelectedPin}
                onOpen={ui.openTask}
                travelMode={user.preferences.travelMode}
              />
              <div className="mt-4 grid gap-3.5 min-[1500px]:grid-cols-2">
                {mapList.map((item) => (
                  <TaskCard
                    key={item.task.id}
                    ranked={item}
                    rank={ranked.indexOf(item)}
                    mode={filters.mode}
                    selected={selectedPin === item.task.id}
                    onSelect={setSelectedPin}
                    requester={getUser(state, item.task.requesterId)}
                  />
                ))}
              </div>
            </div>
          ) : ranked.length === 0 ? (
            <EmptyState
              icon={<Compass className="size-5" aria-hidden />}
              title={
                filters.search
                  ? `No tasks match “${filters.search}”`
                  : filters.mode === "urgent"
                    ? "Nothing urgent nearby"
                    : "No tasks in this view"
              }
              description={
                filters.mode === "urgent"
                  ? "No feasible tasks are due in the next 24 hours. Try For you or Nearby to find something else."
                  : "Try a wider distance, a lower reward floor, or clear your filters. You can also post the first request."
              }
              action={
                !isDefaultFilters ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : filters.mode !== "foryou" ? (
                  <Button
                    variant="outline"
                    onClick={() => setFilters((f) => ({ ...f, mode: "foryou" }))}
                  >
                    Show For you
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3.5 min-[1500px]:grid-cols-2">
              {ranked.map((item, index) => (
                <TaskCard
                  key={item.task.id}
                  ranked={item}
                  rank={index}
                  mode={filters.mode}
                  selected={selectedPin === item.task.id}
                  onSelect={setSelectedPin}
                  requester={getUser(state, item.task.requesterId)}
                />
              ))}
            </div>
          )}
        </section>

        {view === "list" ? (
          <aside className="hidden xl:block">
            <div className="sticky top-8">
              <MapPanel
                tasks={ranked}
                selectedId={selectedPin}
                onSelect={setSelectedPin}
                onOpen={ui.openTask}
                compact
                travelMode={user.preferences.travelMode}
              />
            </div>
          </aside>
        ) : null}
      </div>

      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        helperDistance={user.preferences.maxDistanceMiles}
        view={view}
        onViewChange={setView}
        onApply={() => setFiltersOpen(false)}
      />
    </div>
  );
}

function FiltersModal({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  helperDistance,
  view,
  onViewChange,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onChange: (updater: (current: DiscoverFilters) => DiscoverFilters) => void;
  onReset: () => void;
  helperDistance: number;
  view: "list" | "map";
  onViewChange: (view: "list" | "map") => void;
  onApply: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset
          </Button>
          <Button variant="dark" size="sm" onClick={onApply}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-ink">View</p>
          <SegmentedControl
            size="sm"
            ariaLabel="Feed view"
            value={view}
            onChange={onViewChange}
            options={[
              { value: "list", label: "List", icon: <List className="size-3.5" aria-hidden /> },
              { value: "map", label: "Map", icon: <MapIcon className="size-3.5" aria-hidden /> },
            ]}
          />
        </div>

        <div>
          <p className="text-[13px] font-semibold text-ink">Sort</p>
          <div className="mt-2">
            <SegmentedControl
              size="sm"
              ariaLabel="Discovery mode"
              value={filters.mode}
              onChange={(modeValue) => onChange((f) => ({ ...f, mode: modeValue }))}
              options={MODES.map((m) => ({ value: m.value, label: m.label }))}
              className="max-w-full overflow-x-auto"
            />
          </div>
        </div>

        <div>
          <p className="text-[13px] font-semibold text-ink">Category</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                aria-pressed={filters.category === cat.value}
                onClick={() => onChange((f) => ({ ...f, category: cat.value }))}
                className={cn(
                  "rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  filters.category === cat.value
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="min-reward" className="text-[13px] font-semibold text-ink">
              Minimum reward
            </label>
            <span className="tabular text-[13px] font-semibold text-ink">
              {filters.minRewardCents === 0 ? "Any" : `${formatMoney(filters.minRewardCents)}+`}
            </span>
          </div>
          <input
            id="min-reward"
            type="range"
            min={0}
            max={2000}
            step={100}
            value={filters.minRewardCents}
            onChange={(e) =>
              onChange((f) => ({ ...f, minRewardCents: Number(e.target.value) }))
            }
            className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-surface accent-[#17191c]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>Any</span>
            <span>$20+</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="max-distance" className="text-[13px] font-semibold text-ink">
              Maximum distance
            </label>
            <span className="tabular text-[13px] font-semibold text-ink">
              {formatMiles(filters.maxDistanceMiles)}
            </span>
          </div>
          <input
            id="max-distance"
            type="range"
            min={0.5}
            max={Math.max(0.5, helperDistance)}
            step={0.1}
            value={Math.min(filters.maxDistanceMiles, helperDistance)}
            onChange={(e) =>
              onChange((f) => ({ ...f, maxDistanceMiles: Number(e.target.value) }))
            }
            className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-surface accent-[#17191c]"
          />
          <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-muted">
            <MapPin className="size-3" aria-hidden />
            Within your {formatMiles(helperDistance)} profile radius
          </p>
        </div>
      </div>
    </Modal>
  );
}
