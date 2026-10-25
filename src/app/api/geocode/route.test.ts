import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/geocode/route";

function search(query: string) {
  return GET(new Request(`http://localhost/api/geocode?q=${encodeURIComponent(query)}`));
}

function feature(name: string, lat: number, lng: number, extra: Record<string, string> = {}) {
  return {
    geometry: { coordinates: [lng, lat] },
    properties: { name, ...extra },
  };
}

function mockPhoton(handler: (query: string) => unknown) {
  const spy = vi.fn(async (url: string | URL | Request) => {
    const query = new URL(String(url)).searchParams.get("q") ?? "";
    return new Response(JSON.stringify({ features: handler(query) }), { status: 200 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/geocode", () => {
  it("ignores queries too short to search", async () => {
    const spy = mockPhoton(() => []);
    const response = await search("pa");
    expect(await response.json()).toEqual({ places: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("puts a campus place first for a catalogue query", async () => {
    mockPhoton(() => [feature("Pattee Mall", 40.7954, -77.863)]);
    const body = await (await search("pattee")).json();
    expect(body.places[0].label).toBe("Pattee & Paterno Libraries");
    expect(body.places[0].locationId).toBe("pattee");
  });

  it("finds a building when the house number alone matches nothing local", async () => {
    // "216 Hammond" only resolves outside town; the stripped "Hammond" query
    // is what surfaces the campus building.
    const spy = mockPhoton((query) =>
      query === "216 Hammond"
        ? [feature("216 Hammond Road", 45.2, -77.9)]
        : [feature("Hammond Building", 40.7936, -77.8631, { city: "State College" })],
    );
    const body = await (await search("216 Hammond")).json();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(body.places[0].label).toContain("Hammond Building");
    expect(body.places[0].lat).toBeCloseTo(40.7936, 3);
    expect(body.outOfRange).toBe(false);
  });

  it("rejects addresses outside the service area instead of pricing a 600 mile trip", async () => {
    mockPhoton(() => [feature("Eiffel Tower", 48.8584, 2.2945, { city: "Paris" })]);
    const body = await (await search("Eiffel Tower Paris")).json();
    expect(body.places).toEqual([]);
    expect(body.outOfRange).toBe(true);
  });

  it("still returns campus places when the geocoder is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const response = await search("Willard");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.offline).toBe(true);
    expect(body.places[0].locationId).toBe("willard");
  });
});
