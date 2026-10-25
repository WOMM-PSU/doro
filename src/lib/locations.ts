/**
 * Campus locations at University Park, PA. Coordinates are the OpenStreetMap
 * positions of each building (or the centre of a residence-hall group),
 * rounded to about 10 m, so labels and pins sit on the right streets.
 *
 * They are used to calculate straight-line demo distances.
 * They are not live user positions and must not be presented as precise
 * navigation. Travel times are labelled estimates throughout the UI.
 */

export interface DemoLocation {
  id: string;
  name: string;
  shortLabel: string;
  lat: number;
  lng: number;
  category: "campus" | "residence" | "dining" | "town" | "study";
  area: string;
}

export const LOCATIONS: DemoLocation[] = [
  {
    id: "hub",
    name: "HUB-Robeson Center",
    shortLabel: "the HUB",
    lat: 40.7982,
    lng: -77.861,
    category: "campus",
    area: "Campus core",
  },
  {
    id: "pattee",
    name: "Pattee & Paterno Libraries",
    shortLabel: "Pattee Library",
    lat: 40.7981,
    lng: -77.8658,
    category: "study",
    area: "Library mall",
  },
  {
    id: "west-halls",
    name: "West Halls",
    shortLabel: "West Halls",
    lat: 40.7962,
    lng: -77.8673,
    category: "residence",
    area: "West campus",
  },
  {
    id: "pollock-halls",
    name: "Pollock Halls",
    shortLabel: "Pollock Halls",
    lat: 40.802,
    lng: -77.8565,
    category: "residence",
    area: "Northeast of the HUB",
  },
  {
    id: "east-halls",
    name: "East Halls",
    shortLabel: "East Halls",
    lat: 40.8056,
    lng: -77.8618,
    category: "residence",
    area: "East campus",
  },
  {
    id: "south-halls",
    name: "South Halls",
    shortLabel: "South Halls",
    lat: 40.799,
    lng: -77.858,
    category: "residence",
    area: "South campus",
  },
  {
    id: "north-halls",
    name: "North Halls",
    shortLabel: "North Halls",
    lat: 40.8029,
    lng: -77.8665,
    category: "residence",
    area: "North campus",
  },
  {
    id: "willard",
    name: "Willard Building",
    shortLabel: "Willard",
    lat: 40.7958,
    lng: -77.8646,
    category: "campus",
    area: "Campus core",
  },
  {
    id: "kern",
    name: "Kern Building",
    shortLabel: "Kern",
    lat: 40.7973,
    lng: -77.8685,
    category: "campus",
    area: "West campus",
  },
  {
    id: "findlay",
    name: "Findlay Commons",
    shortLabel: "Findlay Commons",
    lat: 40.8064,
    lng: -77.8623,
    category: "dining",
    area: "East campus",
  },
  {
    id: "downtown",
    name: "Downtown State College",
    shortLabel: "downtown",
    lat: 40.7937,
    lng: -77.861,
    category: "town",
    area: "College Ave",
  },
  {
    id: "redifer",
    name: "Redifer Commons",
    shortLabel: "Redifer Commons",
    lat: 40.7996,
    lng: -77.8558,
    category: "dining",
    area: "South campus",
  },
];

const LOCATION_MAP = new Map(LOCATIONS.map((location) => [location.id, location]));
export const DEFAULT_LOCATION_ID = "hub";

export function getLocation(id: string | undefined): DemoLocation {
  return (id && LOCATION_MAP.get(id)) || LOCATION_MAP.get(DEFAULT_LOCATION_ID)!;
}

export function locationName(id: string | undefined): string {
  return getLocation(id).name;
}

export function locationShort(id: string | undefined): string {
  return getLocation(id).shortLabel;
}

/** Great-circle distance in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceBetweenLocations(fromId: string, toId: string): number {
  return haversineMiles(getLocation(fromId), getLocation(toId));
}

export type TravelModeId = "walk" | "bike" | "bus" | "car";

const SPEEDS_MPH: Record<TravelModeId, number> = {
  walk: 3.0,
  bike: 8.0,
  bus: 11.0,
  car: 18.0,
};

const MODE_OVERHEAD_MINUTES: Record<TravelModeId, number> = {
  walk: 2,
  bike: 3,
  bus: 9,
  car: 4,
};

export function travelMinutes(
  miles: number,
  mode: TravelModeId = "walk",
): number {
  const speed = SPEEDS_MPH[mode] ?? SPEEDS_MPH.walk;
  const overhead = MODE_OVERHEAD_MINUTES[mode] ?? 2;
  return Math.max(1, Math.round((miles / speed) * 60 + overhead));
}

/**
 * Demo route estimate: a straight line from the helper's home area to the
 * pickup point, plus a straight line from pickup to drop-off. No routing
 * service is involved and the UI labels these numbers as estimates.
 */
export function estimateRouteMiles(
  helperHomeId: string,
  taskLocationId: string,
  dropoffLocationId?: string,
): number {
  let miles = distanceBetweenLocations(helperHomeId, taskLocationId);
  if (dropoffLocationId) {
    miles += distanceBetweenLocations(taskLocationId, dropoffLocationId);
  }
  return Math.round(miles * 100) / 100;
}

/** Normalized 0–1 map position within the demo campus bounds. */
export function mapPosition(location: DemoLocation): { x: number; y: number } {
  const minLat = 40.792;
  const maxLat = 40.808;
  const minLng = -77.872;
  const maxLng = -77.853;
  const x = ((location.lng - minLng) / (maxLng - minLng)) * 100;
  const y = ((maxLat - location.lat) / (maxLat - minLat)) * 100;
  return {
    x: Math.min(94, Math.max(6, x)),
    y: Math.min(92, Math.max(8, y)),
  };
}
