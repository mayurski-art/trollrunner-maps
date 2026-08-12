export type GeocodeResult = {
  label: string;
  detail: string;
  lat: number;
  lng: number;
  country: string | null;
  countryCode: string | null;
};

type NominatimPlace = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
};

/**
 * OpenStreetMap's public geocoder — no key, no billing, and already on the
 * TrollRunner CSP allowlist. Usage policy asks for <1 req/s, which the
 * debounced caller respects.
 */
const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** Prefer the town over the street: this map is about where you're from. */
function placeLabel(place: NominatimPlace): string {
  const a = place.address ?? {};
  return (
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.county ||
    a.state ||
    place.name ||
    place.display_name.split(",")[0]
  );
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Search is unavailable right now.");
  const places = (await response.json()) as NominatimPlace[];

  return places.map((place) => {
    const address = place.address ?? {};
    return {
      label: placeLabel(place),
      detail: place.display_name,
      lat: Number(place.lat),
      lng: Number(place.lon),
      country: address.country ?? null,
      countryCode: address.country_code ? address.country_code.toUpperCase() : null,
    };
  });
}
