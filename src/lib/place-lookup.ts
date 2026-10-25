/**
 * Turns a place name from a sentence into coordinates.
 *
 * The catalogue answers immediately and without a network call; anything else
 * goes through the same geocoder the address field uses. Returning `undefined`
 * is a normal outcome (offline, unknown building), and the composer then asks
 * the requester to pick the address rather than guessing.
 */

import type { TaskPlace } from "@/types";
import { searchCatalog } from "@/lib/places";

export async function resolvePlaceText(
  text: string | undefined,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<TaskPlace | undefined> {
  const query = text?.trim();
  if (!query || query.length < 2) return undefined;

  const known = searchCatalog(query, 1)[0];
  if (known) return known;

  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { places?: TaskPlace[] };
    return payload.places?.[0];
  } catch {
    return undefined;
  }
}
