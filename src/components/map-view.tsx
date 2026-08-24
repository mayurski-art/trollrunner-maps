"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
// v6 ships no default export — import the classes by name.
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildPinElement } from "@/lib/locations/markers";
import type { TrollPin } from "@/lib/locations/api";

export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
};

export type Projection = "globe" | "mercator";

type Props = {
  pins: TrollPin[];
  myUserId: string | null;
  /** A location being previewed before the user commits to it. */
  draft: { lat: number; lng: number; label: string } | null;
  projection: Projection;
  onSelectPin?: (pin: TrollPin) => void;
  /** When set, the next map click reports its coordinates here instead of selecting a pin. */
  onPickLocation?: (lat: number, lng: number) => void;
  handleRef?: Ref<MapHandle>;
};

/**
 * OpenStreetMap vector tiles, free and keyless. Attribution is required and
 * MapLibre renders it automatically — don't hide the control.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Zoom levels, not globe altitudes: 2 frames the planet, 9 frames a city. */
const HOME_ZOOM = 2;
const CITY_ZOOM = 9;

/**
 * The stock dark style has no generic "land" polygon at all — everything
 * that isn't water, wood, park, residential or ice just shows the bare
 * `background` fill. So the one lever that makes land actually read as
 * land is painting `background` itself green/tan rather than the same
 * near-black used for the ocean. This repaints the whole style toward a
 * real atlas — green land, blue water, pale ice at the poles — while
 * staying dark enough to sit behind the app chrome.
 *
 * Each entry is [layer id, paint property, value]; layers that aren't in the
 * style are skipped, so a style update can't break the map.
 */
const REPAINT: Array<[string, string, string]> = [
  ["background", "background-color", "#16210f"],
  ["water", "fill-color", "#071b2c"],
  ["waterway", "line-color", "#0a2740"],
  ["landcover_wood", "fill-color", "#0f2a13"],
  ["landuse_park", "fill-color", "#1d3a1a"],
  ["landuse_residential", "fill-color", "#332c22"],
  ["landcover_glacier", "fill-color", "#cfe3ee"],
  ["landcover_ice_shelf", "fill-color", "#b7cad8"],
  ["building", "fill-color", "#241d16"],
  ["boundary_country_z0-4", "line-color", "#8fa3c2"],
  ["boundary_country_z5-", "line-color", "#8fa3c2"],
  ["boundary_state", "line-color", "#4a5a46"],
  ["water_name", "text-color", "#7fb8d9"],
  ["water_name", "text-halo-color", "rgba(3,6,12,0.9)"],
];

/**
 * A country's fill color scales with how many trolls have pinned there —
 * purple instead of the land's green so the "activity" layer stays visually
 * distinct from the terrain underneath it. Matched by country *name*: the
 * `/geo/countries.json` polygons and Nominatim's `address.country` mostly
 * agree, with a few well-known exceptions covered here.
 */
const COUNTRY_NAME_ALIASES: Record<string, string> = {
  "United States": "United States of America",
  "Republic of Korea": "South Korea",
  "Korea, Republic of": "South Korea",
  "Democratic People's Republic of Korea": "North Korea",
  "Czech Republic": "Czechia",
  "Ivory Coast": "Côte d'Ivoire",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Republic of the Congo": "Congo",
  "Russian Federation": "Russia",
};

const DENSITY_STEPS: Array<[min: number, color: string]> = [
  [1, "rgba(88,86,214,0.28)"],
  [2, "rgba(105,103,224,0.42)"],
  [4, "rgba(124,122,232,0.58)"],
  [8, "rgba(150,148,240,0.72)"],
  [16, "rgba(190,188,255,0.85)"],
];

function densityColor(count: number): string {
  let color = DENSITY_STEPS[0][1];
  for (const [min, c] of DENSITY_STEPS) {
    if (count >= min) color = c;
  }
  return color;
}

/** Builds the `fill-color` match expression for the country-density layer. */
function buildDensityExpression(pins: TrollPin[]): unknown[] {
  const counts = new Map<string, number>();
  for (const pin of pins) {
    if (!pin.country) continue;
    const name = COUNTRY_NAME_ALIASES[pin.country] ?? pin.country;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const expr: unknown[] = ["match", ["get", "name"]];
  for (const [name, count] of counts) {
    expr.push(name, densityColor(count));
  }
  expr.push("rgba(0,0,0,0)");
  return expr;
}

const LABEL_LAYERS = [
  "place_other",
  "place_suburb",
  "place_village",
  "place_town",
  "place_city",
  "place_city_large",
  "place_state",
  "place_country_other",
  "place_country_minor",
  "place_country_major",
];

export function MapView({
  pins,
  myUserId,
  draft,
  projection,
  onSelectPin,
  onPickLocation,
  handleRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  const densityReadyRef = useRef(false);
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  });
  const onSelectRef = useRef(onSelectPin);
  useEffect(() => {
    onSelectRef.current = onSelectPin;
  });
  const onPickRef = useRef(onPickLocation);
  useEffect(() => {
    onPickRef.current = onPickLocation;
  });

  useImperativeHandle(handleRef, () => ({
    flyTo(lat, lng, zoom = CITY_ZOOM) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1600, essential: true });
    },
  }));

  // Create the map once; projection and data flow through the effects below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [-40, 20],
      zoom: HOME_ZOOM,
      // Don't let users zoom out past the default framing — the globe
      // shrinking to a speck (or tiling weirdly at very low zoom) looks bad.
      minZoom: HOME_ZOOM,
      attributionControl: { compact: true },
      // The pin is the point of the map; tilting mostly gets in the way.
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    // Tile and style failures are reported here, not thrown — without this a
    // broken tile host just looks like an empty black map.
    map.on("error", (event) => {
      console.warn("[map]", event.error?.message ?? event);
    });

    // Manual pin placement: only active while a picker callback is set, so a
    // stray click can't relocate someone's pin outside that flow.
    map.on("click", (event) => {
      onPickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });

    map.on("style.load", () => {
      readyRef.current = true;
      const repaint = (layer: string, prop: string, value: string) => {
        if (!map.getLayer(layer)) return;
        map.setPaintProperty(layer, prop, value);
      };
      REPAINT.forEach(([layer, prop, value]) => repaint(layer, prop, value));
      LABEL_LAYERS.forEach((layer) => {
        repaint(layer, "text-color", "#e2e9f5");
        repaint(layer, "text-halo-color", "rgba(3,6,12,0.95)");
      });

      // Country-density choropleth: sits above the base land/water fills but
      // below borders and labels, so it reads as a tint rather than a mask.
      fetch("/geo/countries.json")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no countries.json"))))
        .then((geojson) => {
          if (map.getSource("countries")) return;
          map.addSource("countries", { type: "geojson", data: geojson });
          const beforeId = LABEL_LAYERS.find((id) => map.getLayer(id));
          map.addLayer(
            {
              id: "country-density",
              type: "fill",
              source: "countries",
              paint: { "fill-color": buildDensityExpression(pinsRef.current) as never },
            },
            beforeId
          );
          densityReadyRef.current = true;
        })
        .catch((err: unknown) => {
          console.warn("[map] country density layer failed to load", err);
        });
    });

    return () => {
      readyRef.current = false;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Crosshair cursor is the only visible cue that a click will drop a pin
  // instead of panning, since the click handler above is always attached.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = onPickLocation ? "crosshair" : "";
  }, [onPickLocation]);

  // 2D / 3D is a projection switch on one renderer, not a second map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => map.setProjection({ type: projection });
    if (readyRef.current) apply();
    else map.once("style.load", apply);
  }, [projection]);

  // Re-tint the choropleth whenever the pin set changes (new drop, someone
  // hides theirs, a fresh load). No-ops until the layer itself has loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !densityReadyRef.current) return;
    map.setPaintProperty("country-density", "fill-color", buildDensityExpression(pins) as never);
  }, [pins]);

  // Pins are plain DOM markers, so they look identical in both projections
  // and MapLibre handles occlusion behind the globe for us.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible: TrollPin[] = draft
      ? pins.filter((p) => p.userId !== myUserId)
      : pins.slice();
    if (draft) {
      visible.push({
        userId: myUserId ?? "draft",
        lat: draft.lat,
        lng: draft.lng,
        label: draft.label,
        country: null,
        countryCode: null,
        username: "Your pin",
        avatarUrl: null,
        level: 1,
        updatedAt: new Date().toISOString(),
      });
    }

    for (const pin of visible) {
      const el = buildPinElement(pin, {
        isMine: pin.userId === myUserId,
        onSelect: (p) => onSelectRef.current?.(p),
      });
      markersRef.current.push(
        new Marker({ element: el, anchor: "bottom" })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map)
      );
    }
  }, [pins, draft, myUserId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
