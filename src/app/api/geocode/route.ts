import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/places";
import type { TaskPlace } from "@/types";

/**
 * Address search for the composer.
 *
 * Catalogue spots are matched locally first so the demo's campus places appear
 * instantly and without a network call. Anything else goes to Photon, an open
 * OpenStreetMap geocoder, biased towards State College. Results are cached
 * briefly so typing "ham" then "hamm" then "hammo" costs one upstream request.
 */

export const dynamic = "force-dynamic";

const PHOTON_BASE = process.env.PHOTON_BASE_URL?.replace(/\/$/, "") || "https://photon.komoot.io";
/** Bias results towards the demo campus without excluding other towns. */
const BIAS = { lat: 40.798, lng: -77.86 };
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 300;

interface CacheEntry {
  at: number;
  places: TaskPlace[];
}

const cache = new Map<string, CacheEntry>();

function fromCache(key: string): TaskPlace[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.places;
}

function toCache(key: string, places: TaskPlace[]): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { at: Date.now(), places });
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
    osm_id?: number | string;
    osm_type?: string;
    country?: string;
  };
}

function photonPlace(feature: PhotonFeature): TaskPlace | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = feature.properties ?? {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const label = [p.name || street, p.name ? street : undefined, p.city || p.state]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(", ");
  if (!label.trim()) return null;
  return { label: label.slice(0, 120), lat, lng };
}

/**
 * Keeps the list inside doro's service area. A search for "Hammond Building"
 * should not be answered by Winnipeg or Cambridge, and a task 600 miles away
 * would price travel at four figures, so out-of-area hits are dropped rather
 * than offered as a trap.
 */
const SERVICE_RADIUS_MILES = 60;

function preferNearby(places: TaskPlace[]): TaskPlace[] {
  return places.filter((place) => haversineMiles(place, BIAS) <= SERVICE_RADIUS_MILES);
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

function dedupe(places: TaskPlace[]): TaskPlace[] {
  const seen = new Set<string>();
  const out: TaskPlace[] = [];
  for (const place of places) {
    const key = `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 3) {
    return NextResponse.json({ places: [] });
  }

  // "216 Hammond" matches house numbers all over the country and "Pollock 214"
  // matches nothing, so search the building name on its own too and let the
  // local match win.
  const variants = [
    query.replace(/^\d+[a-z]?\s+/i, "").trim(),
    query.replace(/\s+\d+[a-z]?$/i, "").trim(),
  ].filter((variant) => variant.length >= 3 && variant !== query);
  const queries = [query, ...new Set(variants)];

  const catalog = dedupe(
    queries.flatMap((q) => searchCatalog(q, 3)),
  ).slice(0, 4);
  const key = query.toLowerCase();
  const cached = fromCache(key);
  if (cached) {
    return NextResponse.json({ places: dedupe([...catalog, ...cached]) });
  }

  try {
    const responses = await Promise.allSettled(
      queries.map(async (q) => {
        const url = `${PHOTON_BASE}/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${BIAS.lat}&lon=${BIAS.lng}`;
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) throw new Error("geocoder unavailable");
        return ((await response.json()) as { features?: PhotonFeature[] }).features ?? [];
      }),
    );
    const features = responses.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (features.length === 0) throw new Error("geocoder unavailable");
    const places = features
      .map(photonPlace)
      .filter((place): place is TaskPlace => place !== null);
    const nearby = preferNearby(places).slice(0, 6);
    toCache(key, nearby);
    return NextResponse.json({
      places: dedupe([...catalog, ...nearby]),
      outOfRange: nearby.length === 0 && catalog.length === 0,
    });
  } catch {
    // The catalogue still works offline; a typed address just can't resolve.
    return NextResponse.json(
      { places: catalog, offline: true },
      { status: catalog.length > 0 ? 200 : 503 },
    );
  }
}
