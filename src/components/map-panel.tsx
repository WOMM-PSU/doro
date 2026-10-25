"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  ArrowRight,
  Compass,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Plus,
} from "lucide-react";
import type { RankedTask } from "@/features/selectors";
import {
  LOCATIONS,
  distanceBetweenLocations,
  getLocation,
  mapPosition,
  travelMinutes,
  type TravelModeId,
} from "@/lib/locations";
import { formatMiles, formatMoney, formatTravel } from "@/lib/format";
import { cn, useToast } from "@/components/ui";

type MapStyleMode = "voyager" | "osm" | "blueprint";

const PSU_CENTER: [number, number] = [40.7982, -77.8588];
const DEFAULT_ZOOM = 15;
const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;
// CARTO tiles render an "API KEY REQUIRED" watermark without a key, so the
// keyless default is the public OpenStreetMap street map.
const STREET_MODES: Exclude<MapStyleMode, "blueprint">[] = CARTO_API_KEY
  ? ["voyager", "osm"]
  : ["osm"];
const STYLE_CYCLE: MapStyleMode[] = [...STREET_MODES, "blueprint"];

const TILE_SOURCES: Record<
  Exclude<MapStyleMode, "blueprint">,
  { url: string; attribution: string; subdomains?: string }
> = {
  voyager: {
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY ?? ""}`,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
  },
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
};

const JITTER_OFFSETS_DEG: [number, number][] = [
  [0, 0],
  [0.00038, 0.00052],
  [-0.00038, -0.00048],
  [0.00042, -0.00045],
  [-0.00042, 0.00048],
];

/** More tasks than this at one place collapse into a "+N" bubble until zoomed in. */
const MAX_PINS_PER_PLACE = 5;
const PIN_SPREAD_ZOOM = 17;

/** Golden-angle spiral so any number of pins at one place spread out evenly. */
function spreadOffset(index: number): [number, number] {
  if (index === 0) return [0, 0];
  const angle = index * 2.39996;
  const radius = 0.0003 * Math.sqrt(index);
  return [radius * Math.sin(angle), radius * 1.3 * Math.cos(angle)];
}

/** Pins to draw at one place: the selected task first, capped unless zoomed in. */
function pinsForPlace(group: RankedTask[], selectedId: string | null, zoomedIn: boolean) {
  const selected = group.find((r) => r.task.id === selectedId);
  const ordered = selected ? [selected, ...group.filter((r) => r !== selected)] : group;
  if (group.length <= MAX_PINS_PER_PLACE || zoomedIn) return { visible: ordered, hidden: 0 };
  const visible = ordered.slice(0, MAX_PINS_PER_PLACE - 1);
  return { visible, hidden: group.length - visible.length };
}

const BLUEPRINT_OFFSET_PX = [
  { x: 0, y: 0 },
  { x: 18, y: -10 },
  { x: -18, y: -8 },
  { x: 10, y: 15 },
  { x: -12, y: 16 },
];

export function MapPanel({
  tasks,
  selectedId,
  onSelect,
  onOpen,
  compact,
  travelMode = "walk",
}: {
  tasks: RankedTask[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  onOpen: (taskId: string) => void;
  compact?: boolean;
  travelMode?: TravelModeId;
}) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<import("leaflet").Map | null>(null);
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const markersLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const routeLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const userLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletModuleRef = useRef<typeof import("leaflet") | null>(null);

  const [styleMode, setStyleMode] = useState<MapStyleMode>(STREET_MODES[0]);
  const [mapReady, setMapReady] = useState(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gestureHint, setGestureHint] = useState<string | null>(null);
  const hintTimerRef = useRef<number | undefined>(undefined);

  const selectedRanked = useMemo(
    () =>
      tasks.find((r) => r.task.id === selectedId) ?? tasks[0] ?? null,
    [tasks, selectedId],
  );

  const byLocation = useMemo(() => {
    const grouped = new Map<string, RankedTask[]>();
    for (const ranked of tasks) {
      const list = grouped.get(ranked.task.locationId) ?? [];
      list.push(ranked);
      grouped.set(ranked.task.locationId, list);
    }
    return grouped;
  }, [tasks]);

  // Initialize real Leaflet map instance on mount
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || leafletMapRef.current) return;
      try {
        const L = await import("leaflet");
        if (cancelled || !mapContainerRef.current) return;
        leafletModuleRef.current = L;

        // Like embedded Google Maps: the page keeps scrolling over the map.
        // Ctrl/⌘ + scroll zooms (see the gesture effect); on touch screens one
        // finger scrolls the page and two fingers pinch to move and zoom.
        const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
        const map = L.map(mapContainerRef.current, {
          center: PSU_CENTER,
          zoom: compact ? 14.5 : DEFAULT_ZOOM,
          zoomControl: false,
          attributionControl: false,
          zoomSnap: 0.5,
          scrollWheelZoom: false,
          dragging: !coarsePointer,
        });

        const source = TILE_SOURCES[STREET_MODES[0]];
        const tileLayer = L.tileLayer(source.url, {
          maxZoom: 19,
          subdomains: source.subdomains ?? "abc",
        });

        tileLayer.on("tileerror", () => {
          // Graceful fallback stays usable via realistic campus blueprint underlay
        });

        tileLayer.addTo(map);
        map.on("zoomend", () => setZoomedIn(map.getZoom() >= PIN_SPREAD_ZOOM));

        const routeLayer = L.layerGroup().addTo(map);
        const markersLayer = L.layerGroup().addTo(map);
        const userLayer = L.layerGroup().addTo(map);

        leafletMapRef.current = map;
        tileLayerRef.current = tileLayer;
        routeLayerRef.current = routeLayer;
        markersLayerRef.current = markersLayer;
        userLayerRef.current = userLayer;
        setMapReady(true);
      } catch {
        // Headless test environments without full DOM layout fall back cleanly to Blueprint mode
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        tileLayerRef.current = null;
        markersLayerRef.current = null;
        routeLayerRef.current = null;
        userLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(hintTimerRef.current), []);

  // Explain the scroll/touch gestures the map ignores, and zoom on Ctrl/⌘ + scroll.
  useEffect(() => {
    const map = leafletMapRef.current;
    const element = mapContainerRef.current;
    if (!mapReady || !map || !element) return;
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
    const flashHint = (text: string) => {
      setGestureHint(text);
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = window.setTimeout(() => setGestureHint(null), 1400);
    };
    let lastZoomAt = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        flashHint(`Use ${modifier} + scroll to zoom the map`);
        return;
      }
      event.preventDefault();
      // Trackpad pinches fire a burst of ctrl+wheel events; take one step per burst slice.
      const now = Date.now();
      if (now - lastZoomAt < 120) return;
      lastZoomAt = now;
      map.setZoomAround(map.mouseEventToContainerPoint(event), map.getZoom() + (event.deltaY < 0 ? 0.5 : -0.5));
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && !map.dragging.enabled()) {
        flashHint("Use two fingers to move the map");
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchmove", onTouchMove);
    };
  }, [mapReady]);

  // Switch tile source when styleMode changes
  useEffect(() => {
    const L = leafletModuleRef.current;
    const map = leafletMapRef.current;
    if (!L || !map || styleMode === "blueprint") return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
      tileLayerRef.current = null;
    }

    const source = TILE_SOURCES[styleMode];
    const nextTile = L.tileLayer(source.url, {
      maxZoom: 19,
      subdomains: source.subdomains ?? "abc",
    }).addTo(map);
    tileLayerRef.current = nextTile;
    map.invalidateSize();
  }, [styleMode]);

  // Sync task markers, landmark labels, and active route line on the real Leaflet map
  useEffect(() => {
    const L = leafletModuleRef.current;
    const map = leafletMapRef.current;
    const markersLayer = markersLayerRef.current;
    const routeLayer = routeLayerRef.current;
    if (!L || !map || !markersLayer || !routeLayer) return;

    let cancelled = false;
    markersLayer.clearLayers();
    routeLayer.clearLayers();

    // 1. Subtle campus landmark reference labels
    for (const loc of LOCATIONS) {
      const labelIcon = L.divIcon({
        className: "doro-landmark-label",
        html: `<div style="transform:translate(-50%, 10px);white-space:nowrap;font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#3a3e45;text-shadow:0 1px 2px rgba(255,255,255,0.95),0 0 4px rgba(255,255,255,0.95);pointer-events:none;">${loc.shortLabel}</div>`,
        iconSize: [0, 0],
      });
      L.marker([loc.lat, loc.lng], {
        icon: labelIcon,
        interactive: false,
      }).addTo(markersLayer);
    }

    // 2. Active task route polyline (pickup -> dropoff)
    const activeTask = selectedRanked?.task;
    if (activeTask && activeTask.dropoffLocationId) {
      const pickupLoc = getLocation(activeTask.locationId);
      const dropoffLoc = getLocation(activeTask.dropoffLocationId);

      const routeLine = L.polyline(
        [
          [pickupLoc.lat, pickupLoc.lng],
          [dropoffLoc.lat, dropoffLoc.lng],
        ],
        {
          color: "#17191c",
          weight: 3,
          dashArray: "6 6",
          opacity: 0.85,
        },
      ).addTo(routeLayer);

      // Routes are only drawn for tasks that actually have two places.
      const params = new URLSearchParams({
        from: `${pickupLoc.lat},${pickupLoc.lng}`,
        to: `${dropoffLoc.lat},${dropoffLoc.lng}`,
        mode: travelMode,
      });
      void fetch(`/api/route?${params.toString()}`)
        .then((response) => (response.ok ? response.json() : null))
        .then(
          (route: { geometry?: [number, number][]; source?: string } | null) => {
            if (cancelled || !route?.geometry?.length) return;
            routeLine.setLatLngs(route.geometry);
            routeLine.setStyle({
              color: route.source === "osrm" ? "#4f6b1e" : "#17191c",
              weight: 4,
              dashArray: route.source === "osrm" ? undefined : "6 6",
              opacity: 0.9,
            });
          },
        )
        .catch(() => {
          // The dashed straight line stays as the fallback.
        });

      const dropIcon = L.divIcon({
        className: "doro-dropoff-pin",
        html: `<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;background:#d7ff65;color:#17191c;border:1.5px solid #17191c;border-radius:999px;padding:2px 7px;font-size:9.5px;font-weight:700;box-shadow:0 2px 8px rgba(23,25,28,0.22);white-space:nowrap;">Drop · ${dropoffLoc.shortLabel}</div>`,
        iconSize: [0, 0],
      });
      L.marker([dropoffLoc.lat, dropoffLoc.lng], {
        icon: dropIcon,
        interactive: false,
      }).addTo(routeLayer);
    }

    // 3. Interactive task reward pins
    for (const [locationId, group] of byLocation.entries()) {
      const baseLoc = getLocation(locationId);
      const crowded = group.length > MAX_PINS_PER_PLACE;
      const { visible, hidden } = pinsForPlace(group, selectedId, zoomedIn);
      visible.forEach((ranked, idx) => {
        const [dLat, dLng] = crowded && zoomedIn ? spreadOffset(idx) : JITTER_OFFSETS_DEG[idx] ?? [0, 0];
        const lat = baseLoc.lat + dLat;
        const lng = baseLoc.lng + dLng;
        const isSelected =
          (selectedId ?? selectedRanked?.task.id) === ranked.task.id;
        const priceText = formatMoney(ranked.task.rewardCents, {
          compact: true,
        });

        const bg = isSelected ? "#17191c" : "#ffffff";
        const fg = isSelected ? "#d7ff65" : "#17191c";
        const border = isSelected ? "#17191c" : "#17191c";
        const dotColor = isSelected ? "#d7ff65" : "#8fb329";
        const scale = isSelected ? "scale(1.1)" : "scale(1)";

        const pinIcon = L.divIcon({
          className: "doro-task-pin",
          html: `<button type="button" aria-label="${selectedId === ranked.task.id ? "Open" : "Select"} ${ranked.task.title}, ${formatMoney(ranked.task.rewardCents)}" style="transform:translate(-50%,-50%) ${scale};display:inline-flex;align-items:center;gap:5px;background:${bg};color:${fg};border:1.5px solid ${border};border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;box-shadow:0 3px 10px rgba(23,25,28,0.22);cursor:pointer;transition:transform 140ms ease;white-space:nowrap;"><span style="width:6px;height:6px;border-radius:999px;background:${dotColor};display:inline-block;"></span>${priceText}</button>`,
          iconSize: [0, 0],
        });

        const marker = L.marker([lat, lng], {
          icon: pinIcon,
          zIndexOffset: isSelected ? 1000 : idx * 10,
        });

        // First tap selects (route + strip below the map); tapping the selected pin opens it.
        marker.on("click", () => {
          if (selectedId === ranked.task.id) onOpen(ranked.task.id);
          else onSelect(ranked.task.id);
        });

        marker.addTo(markersLayer);
      });

      if (hidden > 0) {
        const [dLat, dLng] = JITTER_OFFSETS_DEG[MAX_PINS_PER_PLACE - 1];
        const moreIcon = L.divIcon({
          className: "doro-more-pin",
          html: `<button type="button" aria-label="Show ${hidden} more tasks at ${baseLoc.name}" style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;background:#17191c;color:#d7ff65;border:1.5px solid #17191c;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;box-shadow:0 3px 10px rgba(23,25,28,0.22);cursor:pointer;white-space:nowrap;">+${hidden}</button>`,
          iconSize: [0, 0],
        });
        L.marker([baseLoc.lat + dLat, baseLoc.lng + dLng], { icon: moreIcon, zIndexOffset: 900 })
          .on("click", () => map.setView([baseLoc.lat, baseLoc.lng], PIN_SPREAD_ZOOM + 0.5, { animate: true }))
          .addTo(markersLayer);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [byLocation, selectedId, selectedRanked, onSelect, onOpen, travelMode, mapReady, zoomedIn]);

  // Smoothly pan map when user selects a pin from the feed
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !selectedId) return;
    const found = tasks.find((r) => r.task.id === selectedId);
    if (!found) return;
    const loc = getLocation(found.task.locationId);
    map.panTo([loc.lat, loc.lng], { animate: true, duration: 0.35 });
  }, [selectedId, tasks]);

  const handleZoom = (delta: number) => {
    const map = leafletMapRef.current;
    if (!map) return;
    map.setZoom(map.getZoom() + delta);
  };

  const handleRecenter = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    map.setView(PSU_CENTER, compact ? 14.5 : DEFAULT_ZOOM, { animate: true });
  };

  const handleLocate = () => {
    const L = leafletModuleRef.current;
    const map = leafletMapRef.current;
    const layer = userLayerRef.current;
    if (!navigator.geolocation) {
      toast("This browser doesn't expose a location API.", "error");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        if (!L || !map || !layer) return;
        const { latitude, longitude, accuracy } = position.coords;
        layer.clearLayers();
        L.circle([latitude, longitude], {
          radius: Math.min(250, Math.max(25, accuracy)),
          color: "#17191c",
          weight: 1,
          fillColor: "#d7ff65",
          fillOpacity: 0.12,
        }).addTo(layer);
        L.circleMarker([latitude, longitude], {
          radius: 7,
          color: "#17191c",
          weight: 2,
          fillColor: "#d7ff65",
          fillOpacity: 1,
        })
          .bindTooltip("Your device location", { direction: "top" })
          .addTo(layer);
        map.setView([latitude, longitude], Math.max(map.getZoom(), 16), { animate: true });
        toast("Centered on your device location. It is not shared with anyone.", "success");
      },
      () => {
        setLocating(false);
        toast("Location permission was denied or unavailable.", "error");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 },
    );
  };

  // Campus Grid can't zoom, so a "+N" bubble there switches to the street map first.
  const expandPlace = (locationId: string) => {
    const map = leafletMapRef.current;
    if (!map) return;
    const loc = getLocation(locationId);
    if (styleMode === "blueprint") setStyleMode(STREET_MODES[0]);
    map.setView([loc.lat, loc.lng], PIN_SPREAD_ZOOM + 0.5, { animate: true });
  };

  const cycleMapStyle = () => {
    setStyleMode(
      (prev) => STYLE_CYCLE[(STYLE_CYCLE.indexOf(prev) + 1) % STYLE_CYCLE.length],
    );
  };

  const activePickup = selectedRanked
    ? getLocation(selectedRanked.task.locationId)
    : null;
  const activeDropoff =
    selectedRanked?.task.dropoffLocationId
      ? getLocation(selectedRanked.task.dropoffLocationId)
      : null;
  const activeMiles =
    activePickup && activeDropoff
      ? distanceBetweenLocations(activePickup.id, activeDropoff.id)
      : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
      <div className="relative">
        <div
          className={cn(
            "relative w-full overflow-hidden bg-[#eaece4]",
            compact ? "aspect-[4/3]" : "aspect-[16/10] min-h-[340px]",
          )}
          role="region"
          aria-label="Interactive Penn State University Park campus map"
        >
          {/* Realistic Architectural Penn State Street & Building Blueprint Underlay */}
          <CampusBlueprintUnderlay
            tasks={tasks}
            byLocation={byLocation}
            selectedId={selectedId ?? selectedRanked?.task.id ?? null}
            chosenId={selectedId}
            onSelect={onSelect}
            onExpand={expandPlace}
            onOpen={onOpen}
            interactivePins={!mapReady || styleMode === "blueprint"}
          />

          {/* Live Leaflet Street Map Container (wrapped so React never overwrites Leaflet's .leaflet-container classes) */}
          <div
            className={cn(
              "absolute inset-0 z-10 size-full transition-opacity duration-300",
              styleMode === "blueprint"
                ? "pointer-events-none invisible opacity-0"
                : "visible opacity-100",
            )}
          >
            <div ref={mapContainerRef} className="size-full" />
          </div>

          {/* Top-Left Live Location Badge */}
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-line/90 bg-surface/95 px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-soft backdrop-blur-sm">
            <span className="size-2 rounded-full bg-[#8fb329]" aria-hidden />
            <span>University Park, PA</span>
          </div>

          {/* Top-Right Interactive Map Controls (Layer Switcher, Recenter, Zoom) */}
          <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={cycleMapStyle}
                title="Switch map layer style"
                className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface/95 px-2.5 text-[10px] font-semibold text-ink shadow-soft backdrop-blur-sm transition-colors hover:bg-muted-surface"
              >
                <Layers className="size-3" aria-hidden />
                <span>
                  {styleMode === "blueprint"
                    ? "Campus Grid"
                    : styleMode === STREET_MODES[0]
                      ? "Street"
                      : "OSM"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleRecenter}
                title="Recenter on Penn State campus core"
                aria-label="Recenter map on campus core"
                className="inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface/95 text-ink shadow-soft backdrop-blur-sm transition-colors hover:bg-muted-surface"
              >
                <Compass className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleLocate}
                disabled={locating}
                title="Show my device location"
                aria-label="Show my device location"
                className="inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface/95 text-ink shadow-soft backdrop-blur-sm transition-colors hover:bg-muted-surface disabled:opacity-50"
              >
                <Navigation className={cn("size-3.5", locating && "animate-pulse")} aria-hidden />
              </button>
            </div>

            {styleMode !== "blueprint" ? (
              <div className="flex flex-col self-end overflow-hidden rounded-xl border border-line bg-surface/95 shadow-soft backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => handleZoom(1)}
                  aria-label="Zoom in"
                  className="flex size-7 items-center justify-center text-ink transition-colors hover:bg-muted-surface"
                >
                  <Plus className="size-3.5" aria-hidden />
                </button>
                <div className="h-px bg-line" />
                <button
                  type="button"
                  onClick={() => handleZoom(-1)}
                  aria-label="Zoom out"
                  className="flex size-7 items-center justify-center text-ink transition-colors hover:bg-muted-surface"
                >
                  <Minus className="size-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>

          {gestureHint ? (
            <div
              className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-ink/35 px-6 text-center"
              role="status"
            >
              <span className="rounded-full bg-ink px-3.5 py-2 text-[12px] font-semibold text-white shadow-lift">
                {gestureHint}
              </span>
            </div>
          ) : null}

          {/* Empty State Overlay */}
          {tasks.length === 0 ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#eef1e9]/85 px-6 text-center backdrop-blur-[2px]">
              <MapPin className="size-6 text-muted" aria-hidden />
              <p className="text-sm font-medium text-ink">
                No pins with these filters
              </p>
              <p className="text-xs text-muted">
                Clear filters to see nearby tasks across campus again.
              </p>
            </div>
          ) : null}
        </div>

        {/* Selected Task Route Preview Strip */}
        {selectedRanked ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-muted">
                <Navigation className="size-3 shrink-0 text-ink" aria-hidden />
                <span className="truncate font-semibold text-ink">
                  {activePickup?.shortLabel}
                  {activeDropoff ? ` → ${activeDropoff.shortLabel}` : ""}
                </span>
                {activeMiles > 0 ? (
                  <span className="shrink-0 text-muted">
                    · {formatMiles(activeMiles)} ·{" "}
                    {formatTravel(travelMinutes(activeMiles, travelMode), travelMode)}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-ink">
                {selectedRanked.task.title}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOpen(selectedRanked.task.id)}
              aria-label={`Open ${selectedRanked.task.title}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-lime transition-transform hover:scale-[1.02]"
            >
              <span>
                {formatMoney(selectedRanked.task.rewardCents, {
                  compact: true,
                })}
              </span>
              <ArrowRight className="size-3" aria-hidden />
            </button>
          </div>
        ) : null}

        {/* Map Attribution & Pin Summary Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-muted-surface/50 px-3.5 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-muted">
            <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
            {tasks.length} open {tasks.length === 1 ? "task" : "tasks"} around
            campus
          </span>
          <span className="text-[10px] text-muted">
            {styleMode === "blueprint"
              ? "Campus Architectural Grid · University Park"
              : styleMode === "voyager"
                ? "© OpenStreetMap contributors © CARTO"
                : "© OpenStreetMap contributors"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Realistic architectural street & building footprint map of Penn State
 * University Park. Serves both as the selectable "Campus Grid" mode and as an
 * instant zero-latency underlay before street tiles finish loading.
 */
function CampusBlueprintUnderlay({
  tasks,
  byLocation,
  selectedId,
  chosenId,
  onSelect,
  onExpand,
  onOpen,
  interactivePins,
}: {
  tasks: RankedTask[];
  byLocation: Map<string, RankedTask[]>;
  selectedId: string | null;
  /** The pin the viewer explicitly picked; tapping it again opens the task. */
  chosenId: string | null;
  onSelect: (taskId: string) => void;
  onExpand: (locationId: string) => void;
  onOpen: (taskId: string) => void;
  interactivePins: boolean;
}) {
  const selectedRanked =
    tasks.find((r) => r.task.id === selectedId) ?? tasks[0] ?? null;
  const pickupPos = selectedRanked
    ? mapPosition(getLocation(selectedRanked.task.locationId))
    : null;
  const dropoffPos = selectedRanked?.task.dropoffLocationId
    ? mapPosition(getLocation(selectedRanked.task.dropoffLocationId))
    : null;

  return (
    <div className="absolute inset-0 size-full select-none bg-[#e9ede3]">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full"
        aria-hidden
        preserveAspectRatio="none"
      >
        {/* Campus Greens / Lawns (Old Main Lawn, HUB Lawn, Pattee Mall, IM Fields) */}
        <rect
          x="32"
          y="42"
          width="16"
          height="24"
          rx="2"
          fill="#d6e2cd"
          opacity="0.85"
        />
        <rect
          x="48"
          y="50"
          width="16"
          height="14"
          rx="2"
          fill="#d6e2cd"
          opacity="0.85"
        />
        <rect
          x="26"
          y="24"
          width="14"
          height="18"
          rx="1.5"
          fill="#d6e2cd"
          opacity="0.75"
        />
        <path
          d="M68 8 L98 8 L98 34 L72 34 Z"
          fill="#d6e2cd"
          opacity="0.65"
        />

        {/* Secondary Campus Walkways & Blocks */}
        <g stroke="#f6f7f2" strokeWidth="0.9" opacity="0.9">
          <line x1="18" y1="15" x2="18" y2="90" />
          <line x1="30" y1="15" x2="30" y2="90" />
          <line x1="42" y1="15" x2="42" y2="90" />
          <line x1="54" y1="15" x2="54" y2="90" />
          <line x1="78" y1="15" x2="78" y2="90" />
          <line x1="8" y1="26" x2="94" y2="26" />
          <line x1="8" y1="48" x2="94" y2="48" />
          <line x1="8" y1="70" x2="94" y2="70" />
        </g>

        {/* Major Arterial Roads (Park Ave, Curtin Rd, Pollock Rd, E. College Ave, W. Beaver Ave, Shortlidge Rd, N. Atherton St) */}
        <g stroke="#ffffff" strokeLinecap="round">
          {/* Park Ave (North) */}
          <path d="M 2 14 Q 48 16 98 12" strokeWidth="2.4" fill="none" />
          {/* Curtin Rd */}
          <line x1="4" y1="36" x2="96" y2="34" strokeWidth="2.2" />
          {/* Pollock Rd */}
          <line x1="10" y1="58" x2="94" y2="56" strokeWidth="2.2" />
          {/* E. College Ave */}
          <line x1="0" y1="80" x2="100" y2="76" strokeWidth="3.0" />
          {/* E. Beaver Ave */}
          <line x1="0" y1="91" x2="100" y2="87" strokeWidth="2.4" />
          {/* N. Atherton St (West) */}
          <line x1="8" y1="0" x2="14" y2="100" strokeWidth="2.8" />
          {/* Burrowes Rd */}
          <line x1="25" y1="10" x2="28" y2="96" strokeWidth="2.0" />
          {/* Shortlidge Rd */}
          <line x1="64" y1="10" x2="67" y2="94" strokeWidth="2.2" />
        </g>

        {/* Architectural Building Footprints */}
        <g fill="#d5d9ce" stroke="#bfc5b6" strokeWidth="0.4">
          {/* Pattee & Paterno Library */}
          <rect x="26" y="44" width="6.5" height="4.2" rx="0.6" />
          {/* Kern */}
          <rect x="28" y="61" width="4.5" height="3.5" rx="0.6" />
          {/* West Halls */}
          <rect x="11" y="65" width="6" height="5" rx="0.6" />
          {/* Willard */}
          <rect x="40" y="68" width="5.5" height="3.8" rx="0.6" />
          {/* HUB-Robeson Center */}
          <rect x="49" y="53" width="7.2" height="4.6" rx="0.8" />
          {/* Pollock Halls */}
          <rect x="68" y="56" width="6.5" height="4.8" rx="0.6" />
          {/* East Halls & Findlay */}
          <rect x="82" y="32" width="7.5" height="6" rx="0.8" />
          {/* North Halls */}
          <rect x="61" y="15" width="5.5" height="4.2" rx="0.6" />
          {/* South Halls & Redifer */}
          <rect x="53" y="82" width="6.5" height="4.5" rx="0.6" />
        </g>

        {/* Street Names */}
        <text
          x="52"
          y="75.5"
          fontSize="2.2"
          fontWeight="600"
          fill="#686e60"
          letterSpacing="0.08em"
        >
          E. COLLEGE AVE
        </text>
        <text
          x="45"
          y="33.5"
          fontSize="2.0"
          fontWeight="600"
          fill="#686e60"
          letterSpacing="0.08em"
        >
          CURTIN RD
        </text>
        <text
          x="45"
          y="55.5"
          fontSize="2.0"
          fontWeight="600"
          fill="#686e60"
          letterSpacing="0.08em"
        >
          POLLOCK RD
        </text>

        {/* Active Route Connector in Blueprint Mode */}
        {pickupPos && dropoffPos ? (
          <line
            x1={pickupPos.x}
            y1={pickupPos.y}
            x2={dropoffPos.x}
            y2={dropoffPos.y}
            stroke="#17191c"
            strokeWidth="0.9"
            strokeDasharray="2 1.5"
          />
        ) : null}
      </svg>

      {/* Landmark Labels */}
      {LOCATIONS.map((location) => {
        const { x, y } = mapPosition(location);
        return (
          <span
            key={location.id}
            className="pointer-events-none absolute -translate-x-1/2 translate-y-3 whitespace-nowrap text-[8px] font-semibold uppercase tracking-wide text-[#5a6053] sm:text-[9px]"
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-hidden
          >
            {location.shortLabel}
          </span>
        );
      })}

      {/* Interactive Pin Buttons when in Blueprint mode or before Leaflet tiles finish mounting */}
      {interactivePins
        ? Array.from(byLocation.entries()).flatMap(([locationId, group]) => {
            const base = mapPosition(getLocation(locationId));
            const { visible, hidden } = pinsForPlace(group, chosenId, false);
            const pins = visible.map((ranked, index) => {
              const offset = BLUEPRINT_OFFSET_PX[index] ?? { x: 0, y: 0 };
              const selected = ranked.task.id === selectedId;
              return (
                <button
                  key={ranked.task.id}
                  type="button"
                  onClick={() => {
                    if (chosenId === ranked.task.id) onOpen(ranked.task.id);
                    else onSelect(ranked.task.id);
                  }}
                  aria-label={`${chosenId === ranked.task.id ? "Open" : "Select"} ${ranked.task.title}, ${formatMoney(ranked.task.rewardCents)}`}
                  className={cn(
                    "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold shadow-soft transition-all",
                    selected
                      ? "z-20 scale-110 border-ink bg-ink text-lime"
                      : "border-ink/80 bg-surface text-ink hover:scale-105 hover:border-ink",
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
            if (hidden > 0) {
              const offset = BLUEPRINT_OFFSET_PX[MAX_PINS_PER_PLACE - 1];
              pins.push(
                <button
                  key={`${locationId}-more`}
                  type="button"
                  onClick={() => onExpand(locationId)}
                  aria-label={`Show ${hidden} more tasks at ${getLocation(locationId).name}`}
                  className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-ink bg-ink px-2 py-1 text-[10px] font-semibold text-lime shadow-soft transition-transform hover:scale-105"
                  style={{
                    left: `calc(${base.x}% + ${offset.x}px)`,
                    top: `calc(${base.y}% + ${offset.y}px)`,
                  }}
                >
                  +{hidden}
                </button>,
              );
            }
            return pins;
          })
        : null}
    </div>
  );
}
