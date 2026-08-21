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
 * The stock dark style paints water *lighter* than land, which reads as a flat
 * grey wash from orbit. This repaints it the way a map should look — deep
 * near-black ocean, land clearly lifted off it — and brightens the labels and
 * borders enough to survive over both.
 *
 * Each entry is [layer id, paint property, value]; layers that aren't in the
 * style are skipped, so a style update can't break the map.
 */
const REPAINT: Array<[string, string, string]> = [
  ["background", "background-color", "#1b2331"],
  ["water", "fill-color", "#070d17"],
  ["waterway", "line-color", "#0b1524"],
  ["landcover_wood", "fill-color", "#1b2a26"],
  ["landuse_park", "fill-color", "#1b2a26"],
  ["landuse_residential", "fill-color", "#212a39"],
  ["landcover_glacier", "fill-color", "#2b3546"],
  ["landcover_ice_shelf", "fill-color", "#232d3d"],
  ["building", "fill-color", "#141b26"],
  ["boundary_country_z0-4", "line-color", "#6b7a93"],
  ["boundary_country_z5-", "line-color", "#6b7a93"],
  ["boundary_state", "line-color", "#3f4b5e"],
  ["water_name", "text-color", "#7f93b0"],
  ["water_name", "text-halo-color", "rgba(3,6,12,0.9)"],
];

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
