import type { TrollPin } from "./api";

/**
 * Builds a troll pin as plain DOM, which is what MapLibre markers take. Being
 * real HTML means the hover card is accessible and the pin stays vector-crisp
 * in both the globe and flat projections.
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
    // Initial rather than a mascot glyph — it distinguishes one pin from the
    // next, which a single shared symbol never did.
    avatar.textContent = (pin.username?.trim()?.[0] ?? "?").toUpperCase();
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

