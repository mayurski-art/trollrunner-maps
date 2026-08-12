"use client";

import { useEffect, useState } from "react";
import { listTopLocations, type TopLocation } from "@/lib/locations/api";

type Props = {
  onPick: (location: TopLocation) => void;
  onClose: () => void;
  reloadKey: number;
};

export function TopCitiesPanel({ onPick, onClose, reloadKey }: Props) {
  const [rows, setRows] = useState<TopLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTopLocations(12)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Top cities</h2>
        <button
          type="button"
          className="btn btn--ghost !px-3 !py-1 text-xs"
          onClick={onClose}
          aria-label="Close"
        >
          Close
        </button>
      </div>

      {error ? <p className="text-sm text-[#ff8098]">{error}</p> : null}
      {!rows && !error ? <p className="text-sm text-muted">Counting trolls…</p> : null}
      {rows && !rows.length ? (
        <p className="text-sm text-muted">No pins yet. Be the first one on the map.</p>
      ) : null}

      {rows?.length ? (
        <ol className="scroll-thin max-h-[50vh] space-y-1 overflow-y-auto">
          {rows.map((row, index) => (
            <li key={`${row.label}-${index}`}>
              <button
                type="button"
                onClick={() => onPick(row)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
              >
                <span className="w-5 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.label}</span>
                  {row.country ? (
                    <span className="block truncate text-xs text-muted">{row.country}</span>
                  ) : null}
                </span>
                <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
                  {row.trolls}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
