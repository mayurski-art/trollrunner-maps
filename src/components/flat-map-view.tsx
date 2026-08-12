"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Position } from "geojson";
import { loadCountries, loadLabels, type CountriesGeo, type GeoLabel } from "@/lib/globe/geo";
import { buildPinElement } from "@/lib/globe/markers";
import { projectX, projectY } from "@/lib/globe/mercator";
import type { TrollPin } from "@/lib/locations/api";
import type { MapHandle } from "./globe-view";

type Props = {
  pins: TrollPin[];
  myUserId: string | null;
  draft: { lat: number; lng: number; label: string } | null;
  onSelectPin?: (pin: TrollPin) => void;
  handleRef?: Ref<MapHandle>;
};

type View = { scale: number; x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 16;
const MAX_FLAT_LABELS = 320;

export function FlatMapView({ pins, myUserId, draft, onSelectPin, handleRef }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [countries, setCountries] = useState<CountriesGeo | null>(null);
  const [labels, setLabels] = useState<GeoLabel[] | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  // Read by the pointer-drag handler, which captures the view at drag start.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    void loadCountries().then(setCountries);
    void loadLabels().then(setLabels);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** World coords (scale 1) → screen coords under the current pan/zoom. */
  const project = useCallback(
    (lat: number, lng: number, v: View): [number, number] => [
      projectX(lng, size.w) * v.scale + v.x,
      projectY(lat, size.w, size.h) * v.scale + v.y,
    ],
    [size.w, size.h]
  );

  useImperativeHandle(handleRef, () => ({
    flyTo(lat, lng, zoom) {
      if (!size.w || !size.h) return;
      // `zoom` arrives as a globe altitude, where smaller means closer.
      const scale = clamp(zoom ? 2.2 / Math.max(zoom, 0.08) : 4, MIN_SCALE, MAX_SCALE);
      const wx = projectX(lng, size.w);
      const wy = projectY(lat, size.w, size.h);
      setView(
        clampView({ scale, x: size.w / 2 - wx * scale, y: size.h / 2 - wy * scale }, size)
      );
    },
  }));

  // Land + borders. Canvas keeps 40k vertices cheap to redraw on every pan.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !countries || !size.w || !size.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    const traceRing = (ring: Position[]) => {
      ring.forEach(([lng, lat], i) => {
        const x = projectX(lng, size.w);
        const y = projectY(lat, size.w, size.h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };

    ctx.beginPath();
    for (const feature of countries.features) {
      const geometry = feature.geometry;
      const polys: Position[][][] =
        geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.type === "MultiPolygon"
            ? geometry.coordinates
            : [];
      for (const poly of polys) for (const ring of poly) traceRing(ring);
    }
    ctx.fillStyle = "#46536b";
    ctx.fill("evenodd");
    ctx.lineWidth = 0.6 / view.scale;
    ctx.strokeStyle = "#5d6b87";
    ctx.stroke();
    ctx.restore();
  }, [countries, size, view]);

  // Labels and pins share one overlay, drawn in a single pass so they cannot
  // duplicate each other: labels first, pins on top.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.innerHTML = "";
    if (!size.w || !size.h) return;
    const frag = document.createDocumentFragment();

    // Same budget as the globe: the label set is ~7.5k, so only what is both
    // on screen and allowed at this zoom gets built, most significant first.
    const altitude = 2.2 / view.scale;
    const onScreen = (labels ?? [])
      .filter((label) => {
        if (altitude > label.zoom) return false;
        const [x, y] = project(label.lat, label.lng, view);
        return x >= 0 && y >= 0 && x <= size.w && y <= size.h;
      })
      .sort((a, b) => b.zoom - a.zoom)
      .slice(0, MAX_FLAT_LABELS);

    for (const label of onScreen) {
      const [x, y] = project(label.lat, label.lng, view);
      const el = document.createElement("div");
      el.className = `geo-label geo-label--${label.kind}`;
      el.textContent = label.name;
      el.style.position = "absolute";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = "translate(-50%, -50%)";
      frag.appendChild(el);
    }

    const visible: TrollPin[] = draft ? pins.filter((p) => p.userId !== myUserId) : pins.slice();
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
      const [x, y] = project(pin.lat, pin.lng, view);
      if (x < -60 || y < -60 || x > size.w + 60 || y > size.h + 60) continue;
      const el = buildPinElement(pin, {
        isMine: pin.userId === myUserId,
        onSelect: onSelectPin,
      });
      el.style.position = "absolute";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = "translate(-50%, -100%)";
      frag.appendChild(el);
    }

    layer.appendChild(frag);
  }, [pins, draft, myUserId, onSelectPin, project, view, size, labels]);

  const onWheel = (event: React.WheelEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setView((prev) => {
      const next = clamp(prev.scale * Math.exp(-event.deltaY * 0.0016), MIN_SCALE, MAX_SCALE);
      const k = next / prev.scale;
      return clampView(
        { scale: next, x: px - (px - prev.x) * k, y: py - (py - prev.y) * k },
        size
      );
    });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, view: viewRef.current };
    const move = (e: PointerEvent) => {
      setView(
        clampView(
          {
            scale: start.view.scale,
            x: start.view.x + (e.clientX - start.x),
            y: start.view.y + (e.clientY - start.y),
          },
          size
        )
      );
    };
    const up = () => {
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full cursor-grab touch-none overscroll-none active:cursor-grabbing"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        ref={layerRef}
        className="pointer-events-none absolute inset-0 [&>.pin]:pointer-events-auto"
      />
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Keeps the map from being dragged off into empty space. */
function clampView(v: View, size: { w: number; h: number }): View {
  if (!size.w || !size.h) return v;
  const worldW = size.w * v.scale;
  const worldH = size.h * v.scale;
  const maxX = worldW <= size.w ? (size.w - worldW) / 2 : 0;
  const minX = worldW <= size.w ? maxX : size.w - worldW;
  const maxY = worldH <= size.h ? (size.h - worldH) / 2 : 0;
  const minY = worldH <= size.h ? maxY : size.h - worldH;
  return { scale: v.scale, x: clamp(v.x, minX, maxX), y: clamp(v.y, minY, maxY) };
}
