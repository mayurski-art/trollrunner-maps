"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/accounts/session-context";
import { getMyLocation, listPins, type MyLocation, type TrollPin } from "@/lib/locations/api";
import { geocode, type GeocodeResult } from "@/lib/locations/geocode";
import type { MapHandle } from "./globe-view";
import { AuthPanel } from "./auth-panel";
import { PinComposer } from "./pin-composer";
import { TopCitiesPanel } from "./top-cities-panel";

// Both views touch window/WebGL on mount, so neither can be server-rendered.
const GlobeView = dynamic(() => import("./globe-view").then((m) => m.GlobeView), {
  ssr: false,
});
const FlatMapView = dynamic(() => import("./flat-map-view").then((m) => m.FlatMapView), {
  ssr: false,
});

type Mode = "3d" | "2d";
type Panel = "none" | "pin" | "auth" | "top";

export function MapShell() {
  const { status, session, logout } = useSession();
  const [mode, setMode] = useState<Mode>("3d");
  const [panel, setPanel] = useState<Panel>("none");
  const [pins, setPins] = useState<TrollPin[]>([]);
  const [storedLocation, setStoredLocation] = useState<MyLocation | null>(null);
  const [draft, setDraft] = useState<GeocodeResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const globeHandle = useRef<MapHandle | null>(null);
  const flatHandle = useRef<MapHandle | null>(null);
  const activeHandle = useCallback(
    () => (mode === "3d" ? globeHandle.current : flatHandle.current),
    [mode]
  );

  const refresh = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    listPins()
      .then((rows) => {
        if (!cancelled) {
          setPins(rows);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load the map.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void getMyLocation(session.userId).then((loc) => {
      if (!cancelled) setStoredLocation(loc);
    });
    return () => {
      cancelled = true;
    };
  }, [session, reloadKey]);

  // Derived rather than cleared on logout, so signing out can't leave a
  // stale pin behind.
  const myLocation = session ? storedLocation : null;

  const flyTo = useCallback(
    (lat: number, lng: number, zoom?: number) => {
      // Give a freshly-swapped view a frame to mount before driving it.
      requestAnimationFrame(() => activeHandle()?.flyTo(lat, lng, zoom));
    },
    [activeHandle]
  );

  const handleDraftChange = useCallback(
    (next: GeocodeResult | null) => {
      setDraft(next);
      if (next) flyTo(next.lat, next.lng, 0.5);
    },
    [flyTo]
  );

  const openPinPanel = useCallback(() => {
    setPanel(session ? "pin" : "auth");
  }, [session]);

  const draftMarker = useMemo(
    () => (draft ? { lat: draft.lat, lng: draft.lng, label: draft.label } : null),
    [draft]
  );

  const mapProps = {
    pins,
    myUserId: session?.userId ?? null,
    draft: draftMarker,
    onSelectPin: (pin: TrollPin) => flyTo(pin.lat, pin.lng, 0.4),
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <div className="starfield" aria-hidden="true" />

      <div className="absolute inset-0">
        {mode === "3d" ? (
          <GlobeView key="3d" {...mapProps} handleRef={globeHandle} />
        ) : (
          <FlatMapView key="2d" {...mapProps} handleRef={flatHandle} />
        )}
      </div>

      <GlobalSearch onPick={(result) => flyTo(result.lat, result.lng, 0.5)} />

      {/* Top-right actions */}
      <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2">
        {status === "authed" && session ? (
          <button
            type="button"
            className="btn btn--ghost pointer-events-auto !py-2 text-xs"
            onClick={() => void logout()}
            title={`Logged in as ${session.username}`}
          >
            🧌 {session.username}
          </button>
        ) : null}
        <button type="button" className="btn btn--primary pointer-events-auto" onClick={openPinPanel}>
          <span className="inline-block h-2 w-2 rounded-full bg-pin" aria-hidden="true" />
          {myLocation ? "My pin" : "Drop my pin"}
        </button>
      </div>

      {/* Right rail */}
      <div className="pointer-events-none absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
        <button
          type="button"
          className="panel pointer-events-auto flex items-center gap-2 px-4 py-3 text-sm font-medium"
          onClick={() => setPanel(panel === "top" ? "none" : "top")}
        >
          🏆 Top Cities
        </button>
      </div>

      {/* Bottom-left stats */}
      <div className="panel pointer-events-none absolute bottom-4 left-4 z-20 px-4 py-3">
        <p className="font-mono text-lg font-semibold leading-none">{pins.length}</p>
        <p className="mt-1 text-xs text-muted">
          {pins.length === 1 ? "troll on the map" : "trolls on the map"}
        </p>
        {loadError ? <p className="mt-1 text-xs text-[#ff8098]">{loadError}</p> : null}
      </div>

      {/* 2D / 3D toggle */}
      <div
        className="panel absolute bottom-4 right-4 z-20 flex overflow-hidden !rounded-full p-1"
        role="group"
        aria-label="Map projection"
      >
        {(["2d", "3d"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              mode === m ? "bg-white text-black" : "text-muted hover:text-foreground"
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {panel !== "none" ? (
        <aside className="panel absolute left-4 top-4 z-30 max-h-[calc(100dvh-2rem)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto p-5 scroll-thin">
          {panel === "auth" ? (
            <AuthPanel onDone={() => setPanel("pin")} />
          ) : panel === "pin" ? (
            <PinComposer
              myLocation={myLocation}
              draft={draft}
              onDraftChange={handleDraftChange}
              onSaved={refresh}
              onClose={() => {
                setDraft(null);
                setPanel("none");
              }}
            />
          ) : (
            <TopCitiesPanel
              reloadKey={reloadKey}
              onPick={(row) => flyTo(row.lat, row.lng, 0.5)}
              onClose={() => setPanel("none")}
            />
          )}
        </aside>
      ) : null}
    </div>
  );
}

/** The always-visible "Search Location" field that just moves the camera. */
function GlobalSearch({ onPick }: { onPick: (result: GeocodeResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        setResults(await geocode(q, controller.signal));
      } catch {
        // A failed lookup just means no suggestions.
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="absolute left-1/2 top-4 z-20 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">
      <input
        className="w-full rounded-full border border-line bg-surface/70 px-5 py-2.5 text-center text-sm text-foreground outline-none backdrop-blur-xl placeholder:text-muted focus:border-brand/50"
        placeholder="Search Location"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        aria-label="Search for a place on the map"
      />
      {open && q.length >= 2 && results.length ? (
        <ul className="panel scroll-thin mt-2 max-h-64 overflow-y-auto p-1">
          {results.map((result) => (
            <li key={`${result.lat},${result.lng},${result.detail}`}>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(result);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium">{result.label}</span>
                <span className="block truncate text-xs text-muted">{result.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
