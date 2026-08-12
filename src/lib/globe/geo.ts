import type { FeatureCollection, Geometry } from "geojson";

export type CountryProps = { name: string };
export type CountriesGeo = FeatureCollection<Geometry, CountryProps>;

export type GeoLabel = {
  name: string;
  lat: number;
  lng: number;
  kind: "country" | "city";
  capital?: boolean;
  /** Camera altitude at or below which this label is allowed to show. */
  zoom: number;
};

let countriesPromise: Promise<CountriesGeo> | null = null;
let labelsPromise: Promise<GeoLabel[]> | null = null;

export function loadCountries(): Promise<CountriesGeo> {
  countriesPromise ??= fetch("/geo/countries.json").then((r) => {
    if (!r.ok) throw new Error("Could not load the world.");
    return r.json() as Promise<CountriesGeo>;
  });
  return countriesPromise;
}

export function loadLabels(): Promise<GeoLabel[]> {
  labelsPromise ??= fetch("/geo/labels.json")
    .then((r) => {
      if (!r.ok) throw new Error("Could not load map labels.");
      return r.json() as Promise<{ labels: GeoLabel[] }>;
    })
    .then((d) => d.labels);
  return labelsPromise;
}
