"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  List,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
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
import { CATEGORY_LABELS } from "@/features/matching";
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
  useToast,
} from "@/components/ui";

const MODES: { value: DiscoverMode; label: string; hint: string }[] = [
  { value: "foryou", label: "For you", hint: "Ranked by Doro Match: distance, timing, preferences, reward, skills and reliability." },
  { value: "nearby", label: "Nearby", hint: "Shortest estimated routes from your area first." },
  { value: "reward", label: "Best rewards", hint: "Highest estimated reward for the effort, with an hourly cap so tiny tasks don't dominate." },
  { value: "urgent", label: "Urgent", hint: "Tasks you could still finish within the next 24 hours, soonest deadline first." },
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
  const { toast } = useToast();
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

  const mode = MODES.find((m) => m.value === filters.mode) ?? MODES[0];
  // Under the map, the picked pin's task comes first so it is never out of sight.
  const mapList = useMemo(() => {
    const picked = ranked.find((r) => r.task.id === selectedPin);
    return picked ? [picked, ...ranked.filter((r) => r !== picked)] : ranked;
  }, [ranked, selectedPin]);
  const activeFilterCount =
    (filters.category !== "all" ? 1 : 0) +
    (filters.minRewardCents > 0 ? 1 : 0) +
    (filters.maxDistanceMiles < user.preferences.maxDistanceMiles ? 1 : 0);
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
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
          University Park, PA
          <span className="text-line" aria-hidden>|</span>
          <span className="normal-case tracking-normal text-muted">Approximate demo campus</span>
        </div>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[40px]">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-muted sm:text-sm">
          <span className="font-medium text-ink">Get your stuff done.</span> Find a
          nearby task that fits your time, or post one of your own.
        </p>
      </header>

      <section aria-label="Find tasks" className="space-y-3">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
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
              className="h-12 rounded-2xl pl-10 pr-10"
            />
            {filters.search ? (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, search: "" }))}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-muted-surface hover:text-ink"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Discovery mode"
              value={filters.mode}
              onChange={(modeValue) => {
                setFilters((f) => ({ ...f, mode: modeValue }));
                setSelectedPin(null);
              }}
              options={MODES.map((m) => ({ value: m.value, label: m.label }))}
              className="no-scrollbar max-w-full overflow-x-auto"
            />
            <Button
              variant="outline"
              className="relative h-11 shrink-0 rounded-full px-3.5"
              onClick={() => setFiltersOpen(true)}
              aria-label={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="tabular flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-lime">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>

        <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          {CATEGORIES.map((cat) => {
            const active = filters.category === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters((f) => ({ ...f, category: cat.value }))}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-muted hover:border-[#cfd3c9] hover:text-ink",
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_368px]">
        <section aria-label="Task feed" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                {mode.label}
                <span className="tabular rounded-full bg-muted-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                  {ranked.length} {ranked.length === 1 ? "task" : "tasks"}
                </span>
                {!isDefaultFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetFilters();
                      toast("Filters cleared.");
                    }}
                    className="text-[11px] font-medium text-muted underline decoration-line underline-offset-2 hover:text-ink"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{mode.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl
                size="sm"
                ariaLabel="Feed view"
                value={view}
                onChange={setView}
                options={[
                  { value: "list", label: "List", icon: <List className="size-3.5" aria-hidden /> },
                  { value: "map", label: "Map", icon: <MapIcon className="size-3.5" aria-hidden /> },
                ]}
              />
            </div>
          </div>

          {view === "map" ? (
            <div>
              <MapPanel
                tasks={ranked}
                selectedId={selectedPin}
                onSelect={setSelectedPin}
                onOpen={ui.openTask}
                travelMode={user.preferences.travelMode}
              />
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink">Tasks on the map</p>
                  <Button size="sm" variant="ghost" onClick={() => setView("list")}>
                    Back to list
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-3.5 min-[1500px]:grid-cols-2">
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
            </div>
          ) : null}

          {view === "list" ? (
            ranked.length === 0 ? (
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
            )
          ) : null}

        </section>

        <aside className="hidden xl:block">
          <div className="sticky top-8 space-y-4">
            {/* Map view already shows the big map, so the sidebar one would be a duplicate. */}
            {view !== "map" ? (
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Around campus</h2>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    {ranked.length} pins
                  </span>
                </div>
                <MapPanel
                  tasks={ranked}
                  selectedId={selectedPin}
                  onSelect={setSelectedPin}
                  onOpen={ui.openTask}
                  compact
                  travelMode={user.preferences.travelMode}
                />
              </div>
            ) : null}

            <MatchProfileCard />
          </div>
        </aside>
      </div>

      <div className="xl:hidden">
        <MatchProfileCard />
      </div>

      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        helperDistance={user.preferences.maxDistanceMiles}
      />
    </div>
  );
}

function MatchProfileCard() {
  const { user } = useDemo();
  const prefs = user.preferences;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Your match profile</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            These preferences rank For you and set your notification threshold.
          </p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-lime text-ink">
          <Sparkles className="size-4" aria-hidden />
        </span>
      </div>
      <dl className="mt-3.5 space-y-2 text-[11.5px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Discovery radius</dt>
          <dd className="tabular font-medium text-ink">{formatMiles(prefs.maxDistanceMiles)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Minimum reward</dt>
          <dd className="tabular font-medium text-ink">{formatMoney(prefs.minRewardCents)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Getting around</dt>
          <dd className="font-medium capitalize text-ink">{prefs.travelMode}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1">
        {prefs.categories.map((cat) => (
          <span key={cat} className="rounded-full bg-muted-surface px-2 py-1 text-[10px] font-medium text-muted">
            {CATEGORY_LABELS[cat]}
          </span>
        ))}
      </div>
      <Link
        href="/profile"
        className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
      >
        Tune preferences
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
      <details className="group mt-3 border-t border-line pt-2.5">
        <summary className="cursor-pointer list-none text-[10.5px] font-medium text-muted hover:text-ink">
          How Doro Match scores tasks
        </summary>
        <ul className="mt-2 space-y-1 text-[10.5px] text-muted">
          <li>Distance 25% · timing 20% · preferences 15%</li>
          <li>Reward for effort 15% · skills 10%</li>
          <li>Reliability 10% · personal relevance 5%</li>
          <li className="pt-1 text-[10px]">Weights are product assumptions, not learned values.</li>
        </ul>
      </details>
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
}: {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onChange: (updater: (current: DiscoverFilters) => DiscoverFilters) => void;
  onReset: () => void;
  helperDistance: number;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filter tasks"
      description="Narrow the feed without losing your Doro Match ranking."
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset filters
          </Button>
          <Button variant="dark" size="sm" onClick={onClose}>
            Show results
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
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
              Maximum route distance
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
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            Up to your profile radius of {formatMiles(helperDistance)}. Change it in Profile to
            look further.
          </p>
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

        <div className="flex items-start gap-2 rounded-xl bg-muted-surface px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Distances use approximate demo coordinates and straight-line estimates, not live
          navigation.
        </div>
      </div>
    </Modal>
  );
}
