import type { TrollPin } from "@/lib/locations/api";
import type { GeoLabel } from "./geo";

/**
 * Pin + label DOM builders shared by the 3D globe and the 2D map, so a marker
 * looks and behaves identically in both projections.
 */

const PIN_SVG = (fill: string, stroke: string) => `
<svg viewBox="0 0 26 34" aria-hidden="true">
  <path d="M13 33.2C13 33.2 24.4 21.6 24.4 13.1 24.4 6.4 19.3 1 13 1S1.6 6.4 1.6 13.1C1.6 21.6 13 33.2 13 33.2Z"
        fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>
  <circle cx="13" cy="12.7" r="4.1" fill="rgba(255,255,255,0.94)"/>
</svg>`;

export type PinElementOptions = {
  isMine: boolean;
  onSelect?: (pin: TrollPin) => void;
};

export function buildPinElement(pin: TrollPin, opts: PinElementOptions): HTMLElement {
  const el = document.createElement("div");
  el.className = opts.isMine ? "pin pin--mine" : "pin";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  const place = pin.country ? `${pin.label}, ${pin.country}` : pin.label;
  el.setAttribute("aria-label", `${pin.username} — ${place}`);
  el.innerHTML = opts.isMine
    ? PIN_SVG("#ffb020", "rgba(94,54,0,0.65)")
    : PIN_SVG("#ff2d55", "rgba(94,8,26,0.6)");

  const card = document.createElement("div");
  card.className = "pin-card";

  const avatar = document.createElement(pin.avatarUrl ? "img" : "span");
  avatar.className = "pin-card__avatar";
  if (pin.avatarUrl && avatar instanceof HTMLImageElement) {
    avatar.src = pin.avatarUrl;
    avatar.alt = "";
    avatar.loading = "lazy";
  } else {
    avatar.textContent = "🧌";
  }

  const text = document.createElement("div");
  const name = document.createElement("div");
  name.className = "pin-card__name";
  name.textContent = `${pin.username} · LV ${pin.level}`;
  const where = document.createElement("div");
  where.className = "pin-card__place";
  where.textContent = place;
  text.append(name, where);
  card.append(avatar, text);
  el.appendChild(card);

  if (opts.onSelect) {
    const select = () => opts.onSelect?.(pin);
    el.addEventListener("click", select);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  }
  return el;
}

export function buildLabelElement(label: GeoLabel): HTMLElement {
  const el = document.createElement("div");
  el.className = `geo-label geo-label--${label.kind}`;
  el.textContent = label.name;
  return el;
}
