import { describe, expect, it, vi } from "vitest";
import { resolvePlaceText } from "@/lib/place-lookup";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("resolvePlaceText", () => {
  it("returns a catalogue place without calling the network", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const place = await resolvePlaceText("Redifer Commons", { fetchImpl });
    expect(place?.locationId).toBe("redifer");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("geocodes a building the catalogue doesn't know", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        places: [
          {
            label: "Cooper Hall, East College Avenue, State College",
            lat: 40.7999733,
            lng: -77.8550396,
          },
        ],
      }),
    );
    const place = await resolvePlaceText("cooper hall", { fetchImpl });
    expect(place?.label).toContain("Cooper Hall");
    expect(place?.lat).toBeCloseTo(40.8, 2);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns undefined when the geocoder knows nothing or fails", async () => {
    const empty = vi.fn<typeof fetch>(async () => jsonResponse({ places: [] }));
    expect(await resolvePlaceText("zzz nowhere", { fetchImpl: empty })).toBeUndefined();

    const broken = vi.fn<typeof fetch>(async () => new Response("boom", { status: 503 }));
    expect(await resolvePlaceText("cooper hall", { fetchImpl: broken })).toBeUndefined();

    const offline = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    expect(await resolvePlaceText("cooper hall", { fetchImpl: offline })).toBeUndefined();
  });

  it("ignores empty text", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await resolvePlaceText(undefined, { fetchImpl })).toBeUndefined();
    expect(await resolvePlaceText("  ", { fetchImpl })).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
