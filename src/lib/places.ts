/**
 * Places on a task.
 *
 * A task keeps two representations of where it is:
 *
 *   - `pickup` / `dropoff` hold the exact place: the label the requester typed
 *     plus its coordinates. This is what distance, pricing, the map and the
 *     route use, so any address works, not just the demo catalogue.
 *   - `locationId` / `dropoffLocationId` hold the nearest catalogue spot. They
 *     keep older code (preferences, seeded tasks, copy) working and are what a
 *     seeded task has instead of coordinates.
 *
 * `taskPickup()` and `taskDropoff()` are the one place that decides which
 * representation wins, so every consumer agrees.
 */

import {
  DEFAULT_LOCATION_ID,
  LOCATIONS,
  getLocation,
  haversineMiles,
  type DemoLocation,
} from "@/lib/locations";
import type { TaskPlace } from "@/types";

/** Map bounds used by the demo map, in degrees. */
const MAP_BOUNDS = {
  minLat: 40.792,
  maxLat: 40.808,
  minLng: -77.872,
  maxLng: -77.853,
};

export function placeFromLocation(location: DemoLocation): TaskPlace {
  return {
    label: location.name,
    lat: location.lat,
    lng: location.lng,
    locationId: location.id,
  };
}

export function placeFromLocationId(id: string | undefined): TaskPlace {
  return placeFromLocation(getLocation(id));
}

/** The catalogue spot closest to a coordinate, used to fill the legacy ids. */
export function nearestLocation(place: { lat: number; lng: number }): DemoLocation {
  let best = LOCATIONS[0];
  let bestMiles = Number.POSITIVE_INFINITY;
  for (const location of LOCATIONS) {
    const miles = haversineMiles(location, place);
    if (miles < bestMiles) {
      best = location;
      bestMiles = miles;
    }
  }
  return best;
}

export function nearestLocationId(place: { lat: number; lng: number }): string {
  return nearestLocation(place).id;
}

export function isUsablePlace(value: unknown): value is TaskPlace {
  if (typeof value !== "object" || value === null) return false;
  const place = value as Partial<TaskPlace>;
  return (
    typeof place.label === "string" &&
    place.label.trim().length > 0 &&
    typeof place.lat === "number" &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng) &&
    place.lat >= -90 &&
    place.lat <= 90 &&
    place.lng >= -180 &&
    place.lng <= 180
  );
}

export function taskPickup(task: {
  locationId?: string;
  pickup?: TaskPlace;
}): TaskPlace {
  if (isUsablePlace(task.pickup)) return task.pickup;
  return placeFromLocationId(task.locationId ?? DEFAULT_LOCATION_ID);
}

export function taskDropoff(task: {
  dropoffLocationId?: string;
  dropoff?: TaskPlace;
}): TaskPlace | undefined {
  if (isUsablePlace(task.dropoff)) return task.dropoff;
  if (task.dropoffLocationId) return placeFromLocationId(task.dropoffLocationId);
  return undefined;
}

export function placeDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMiles(a, b);
}

export function samePlace(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return placeDistance(a, b) < 0.02;
}

/** Helper's home → pickup → drop-off, as straight-line miles. */
export function taskRouteMiles(
  helperHomeId: string,
  task: { locationId?: string; pickup?: TaskPlace; dropoffLocationId?: string; dropoff?: TaskPlace },
): number {
  const pickup = taskPickup(task);
  const dropoff = taskDropoff(task);
  let miles = placeDistance(getLocation(helperHomeId), pickup);
  if (dropoff) miles += placeDistance(pickup, dropoff);
  return Math.round(miles * 100) / 100;
}

/** Normalised 0–1 map position within the demo campus bounds. */
export function mapPositionOf(place: { lat: number; lng: number }): { x: number; y: number } {
  const x = ((place.lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
  const y = ((MAP_BOUNDS.maxLat - place.lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100;
  return {
    x: Math.min(94, Math.max(6, x)),
    y: Math.min(92, Math.max(8, y)),
  };
}

/** Catalogue suggestions for the address field, matched locally. */
export function searchCatalog(query: string, limit = 4): TaskPlace[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const scored = LOCATIONS.map((location) => {
    const haystacks = [location.name, location.shortLabel, location.area, location.id];
    let score = 0;
    for (const hay of haystacks) {
      const value = hay.toLowerCase();
      if (value === needle) score = Math.max(score, 4);
      else if (value.startsWith(needle)) score = Math.max(score, 3);
      else if (value.includes(needle)) score = Math.max(score, 1);
    }
    return { location, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => placeFromLocation(entry.location));
}

/** One-line description: "Pattee Library → East Halls". */
export function placesLabel(pickup: TaskPlace, dropoff?: TaskPlace): string {
  return dropoff ? `${pickup.label} → ${dropoff.label}` : pickup.label;
}
