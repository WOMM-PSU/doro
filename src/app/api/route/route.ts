import { NextResponse } from "next/server";
import {
  haversineMiles,
  travelMinutes,
  type TravelModeId,
} from "@/lib/locations";

/**
 * Real route geometry for tasks that have a pickup and a drop-off.
 *
 * OSRM's public server provides the road path. Its driving duration is not
 * used for walk/bike modes; the app keeps its own transparent per-mode time
 * estimate so the label stays honest. If OSRM is slow or unavailable, the
 * straight line is returned as a marked fallback.
 */

export const dynamic = "force-dynamic";

const OSRM_BASE = process.env.OSRM_BASE_URL?.replace(/\/$/, "") || "https://router.project-osrm.org";

type Coord = { lat: number; lng: number };

function coord(value: string | null): Coord | null {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function mode(value: string | null): TravelModeId {
  return value === "bike" || value === "bus" || value === "car" ? value : "walk";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = coord(params.get("from"));
  const to = coord(params.get("to"));
  const travelMode = mode(params.get("mode"));
  if (!from || !to) {
    return NextResponse.json(
      { message: "Pass from=lat,lng and to=lat,lng." },
      { status: 400 },
    );
  }

  const straightMiles = haversineMiles(from, to);
  const fallback = {
    source: "fallback" as const,
    miles: Math.round(straightMiles * 100) / 100,
    minutes: travelMinutes(straightMiles, travelMode),
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
  };

  if (!OSRM_BASE.startsWith("http")) return NextResponse.json(fallback);

  try {
    const url = `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "application/json" },
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return NextResponse.json(fallback);
    const payload = (await response.json()) as {
      code?: string;
      routes?: { distance: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = payload.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (payload.code !== "Ok" || !route || !coordinates?.length) {
      return NextResponse.json(fallback);
    }
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
    const geometry = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    const miles = Math.round((route.distance / 1609.344) * 100) / 100;
    return NextResponse.json({
      source: "osrm" as const,
      miles,
      minutes: travelMinutes(miles, travelMode),
      geometry,
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
