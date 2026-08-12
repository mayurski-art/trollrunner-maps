"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/accounts/session-context";
import { geocode, type GeocodeResult } from "@/lib/locations/geocode";
import {
  removeMyLocation,
  setMyLocation,
  setMyLocationVisible,
  type MyLocation,
} from "@/lib/locations/api";

type Props = {
  myLocation: MyLocation | null;
  draft: GeocodeResult | null;
  onDraftChange: (draft: GeocodeResult | null) => void;
  onSaved: () => void;
  onClose: () => void;
};

export function PinComposer({ myLocation, draft, onDraftChange, onSaved, onClose }: Props) {
  const { session } = useSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Derived from the saved pin, with the user's in-flight choice taking
  // precedence, so the checkbox never fights a refresh.
  const [visibleChoice, setVisibleChoice] = useState<boolean | null>(null);
  const visible = visibleChoice ?? myLocation?.isVisible ?? true;
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();

  // Debounced search — Nominatim asks for at most one request a second.
  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        setResults(await geocode(q, controller.signal));
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Search failed.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [q]);

  async function handleSave() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await setMyLocation({
        lat: draft.lat,
        lng: draft.lng,
        label: draft.label,
        country: draft.country,
        countryCode: draft.countryCode,
      });
      if (session && !visible) await setMyLocationVisible(session.userId, false);
      onDraftChange(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your pin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVisibility(next: boolean) {
    setVisibleChoice(next);
    // With no saved pin yet there is nothing to update — handleSave applies
    // this choice right after the pin is created.
    if (!session || !myLocation) return;
    setBusy(true);
    try {
      await setMyLocationVisible(session.userId, next);
      onSaved();
    } catch (err) {
      setVisibleChoice(!next);
      setError(err instanceof Error ? err.message : "Could not update visibility.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await removeMyLocation(session.userId);
      onDraftChange(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove your pin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {myLocation ? "Your pin" : "Drop your pin"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pick the town you rep. Nothing more precise than that gets stored.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost !px-3 !py-1 text-xs"
          onClick={onClose}
          aria-label="Close"
        >
          Close
        </button>
      </div>

      {myLocation && !draft ? (
        <div className="rounded-xl border border-line bg-white/5 p-3">
          <p className="text-sm font-semibold">{myLocation.label}</p>
          {myLocation.country ? (
            <p className="text-xs text-muted">{myLocation.country}</p>
          ) : null}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">
          {myLocation ? "Move your pin" : "Search for your city"}
        </span>
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Fontana, California"
          autoComplete="off"
        />
      </label>

      {searching && q.length >= 2 ? <p className="text-xs text-muted">Searching…</p> : null}

      {q.length >= 2 && results.length ? (
        <ul className="scroll-thin max-h-56 space-y-1 overflow-y-auto">
          {results.map((result) => {
            const active = draft?.lat === result.lat && draft?.lng === result.lng;
            return (
              <li key={`${result.lat},${result.lng},${result.detail}`}>
                <button
                  type="button"
                  onClick={() => onDraftChange(result)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-brand/60 bg-brand/10"
                      : "border-line bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="block text-sm font-medium">{result.label}</span>
                  <span className="block truncate text-xs text-muted">{result.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <label className="flex items-start gap-3 rounded-xl border border-line bg-white/5 p-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#30d158]"
          checked={visible}
          onChange={(e) => handleVisibility(e.target.checked)}
          disabled={busy}
        />
        <span>
          <span className="block text-sm font-medium">Show my pin publicly</span>
          <span className="block text-xs text-muted">
            Off means only you can see it — it disappears from the map and from your
            profile.
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-[#ff8098]">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn--primary flex-1"
          onClick={handleSave}
          disabled={!draft || busy}
        >
          {busy ? "Saving…" : myLocation ? "Move my pin here" : "Drop my pin"}
        </button>
        {myLocation ? (
          <button type="button" className="btn btn--danger" onClick={handleRemove} disabled={busy}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
