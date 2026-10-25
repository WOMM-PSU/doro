"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import type { TaskPlace } from "@/types";
import { cn } from "@/lib/cn";

/**
 * Free-text address input that resolves to coordinates.
 *
 * Suggestions merge the local campus catalogue with OSM geocoding behind
 * `/api/geocode`, so the demo's twelve spots stay one keystroke away while any
 * real address can still be picked. The parent only ever receives a resolved
 * `TaskPlace`, never half-typed text, so distance and pricing always have
 * coordinates to work with.
 */

interface AddressFieldProps {
  id: string;
  value?: TaskPlace;
  onChange: (place: TaskPlace | undefined) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function AddressField({
  id,
  value,
  onChange,
  placeholder = "Search an address or campus place",
  hint,
  disabled,
  autoFocus,
}: AddressFieldProps) {
  const listId = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [options, setOptions] = useState<TaskPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [offline, setOffline] = useState(false);
  const [outOfRange, setOutOfRange] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLabel = useRef(value?.label ?? "");

  // Keep the box in sync when the parent sets a place (sentence parser,
  // "post again" prefill, persona switch).
  useEffect(() => {
    const next = value?.label ?? "";
    if (next === selectedLabel.current) return;
    selectedLabel.current = next;
    setText(next);
    setOptions([]);
    setOpen(false);
    setActive(-1);
  }, [value]);

  const query = text.trim();
  useEffect(() => {
    if (query.length < 3 || query === selectedLabel.current) {
      setOptions([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          places?: TaskPlace[];
          offline?: boolean;
          outOfRange?: boolean;
        };
        if (cancelled) return;
        setOptions(payload.places ?? []);
        setOffline(Boolean(payload.offline));
        setOutOfRange(Boolean(payload.outOfRange));
        setOpen(true);
        setActive(-1);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  const choose = (place: TaskPlace) => {
    selectedLabel.current = place.label;
    setText(place.label);
    setOptions([]);
    setOpen(false);
    setActive(-1);
    setOutOfRange(false);
    onChange(place);
  };

  const handleInput = (next: string) => {
    setText(next);
    if (next !== selectedLabel.current) {
      // Typing invalidates the previous selection until a suggestion is picked.
      selectedLabel.current = "";
      onChange(undefined);
    }
  };

  const visible = useMemo(() => (open && options.length > 0 ? options : []), [open, options]);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={visible.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            visible.length > 0 && active >= 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            if (options.length > 0) setOpen(true);
          }}
          onBlur={() => {
            // Let a click on a suggestion land before closing the list.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && visible.length > 0) {
              event.preventDefault();
              setActive((current) => (current + 1) % visible.length);
            } else if (event.key === "ArrowUp" && visible.length > 0) {
              event.preventDefault();
              setActive((current) => (current <= 0 ? visible.length - 1 : current - 1));
            } else if (event.key === "Enter" && visible.length > 0) {
              event.preventDefault();
              choose(visible[active >= 0 ? active : 0]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className={cn(
            "w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-9 text-sm text-ink",
            "placeholder:text-muted/80 focus-visible:border-ink focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-ink/15 disabled:opacity-60",
          )}
        />
        {busy ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
        ) : null}
      </div>

      {visible.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-soft"
        >
          {visible.map((place, index) => (
            <li key={`${place.label}-${place.lat}-${place.lng}`}>
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] leading-snug",
                  index === active ? "bg-ink/[0.06] text-ink" : "text-ink/90",
                )}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="flex-1">{place.label}</span>
                {place.locationId ? (
                  <span className="mt-0.5 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Campus
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
      {offline && query.length >= 3 && !busy && visible.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted">
          Address search needs a connection — campus places still work.
        </p>
      ) : null}
      {outOfRange && !busy && visible.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted">
          No nearby match. Doro covers the State College area for this demo.
        </p>
      ) : null}
    </div>
  );
}
