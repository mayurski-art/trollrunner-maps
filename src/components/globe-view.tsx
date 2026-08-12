"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import type { GlobeInstance } from "globe.gl";
import { loadCountries, loadLabels, type GeoLabel } from "@/lib/globe/geo";
import { buildLabelElement, buildPinElement } from "@/lib/globe/markers";
import type { TrollPin } from "@/lib/locations/api";

export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
};

type Props = {
  pins: TrollPin[];
  myUserId: string | null;
  /** A location being previewed before the user commits to it. */
  draft: { lat: number; lng: number; label: string } | null;
  onSelectPin?: (pin: TrollPin) => void;
  handleRef?: Ref<MapHandle>;
};

/** Camera altitude in globe radii. 2.4 frames the whole planet. */
const HOME_ALTITUDE = 2.4;
const CITY_ALTITUDE = 0.55;

type Marker =
  | { kind: "pin"; id: string; lat: number; lng: number; pin: TrollPin; mine: boolean }
  | { kind: "label"; id: string; lat: number; lng: number; label: GeoLabel };

export function GlobeView({ pins, myUserId, draft, onSelectPin, handleRef }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const labelNodesRef = useRef<Array<{ el: HTMLElement; zoom: number }>>([]);
  const altitudeRef = useRef(HOME_ALTITUDE);
  // Latest values, read from inside long-lived globe callbacks. Declared
  // before the setup effect so they are current by the time it first runs.
  const pinsRef = useRef(pins);
  const draftRef = useRef(draft);
  const myIdRef = useRef(myUserId);
  const onSelectRef = useRef(onSelectPin);
  useEffect(() => {
    pinsRef.current = pins;
    draftRef.current = draft;
    myIdRef.current = myUserId;
    onSelectRef.current = onSelectPin;
  });

  useImperativeHandle(handleRef, () => ({
    flyTo(lat, lng, zoom = CITY_ALTITUDE) {
      const globe = globeRef.current;
      if (!globe) return;
      globe.controls().autoRotate = false;
      globe.pointOfView({ lat, lng, altitude: zoom }, 1200);
    },
  }));

  // Build the scene once. Data changes flow through the effect below.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let globe: GlobeInstance | null = null;
    let detachResize: (() => void) | null = null;

    (async () => {
      const [{ default: Globe }, countries] = await Promise.all([
        import("globe.gl"),
        loadCountries(),
      ]);
      if (disposed || !mountRef.current) return;

      globe = new Globe(mountRef.current, { animateIn: false })
        .width(mountRef.current.clientWidth)
        .height(mountRef.current.clientHeight)
        // Transparent canvas so the CSS star field shows through.
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true)
        .atmosphereColor("#5b8fd6")
        .atmosphereAltitude(0.17)
        .polygonsData(countries.features)
        .polygonAltitude(0.007)
        .polygonCapColor(() => "#46536b")
        .polygonSideColor(() => "rgba(20,28,42,0.9)")
        .polygonStrokeColor(() => "#5d6b87")
        .polygonsTransitionDuration(0)
        .htmlElementsData([])
        .htmlLat((d) => (d as Marker).lat)
        .htmlLng((d) => (d as Marker).lng)
        .htmlAltitude(0.012)
        .htmlTransitionDuration(0)
        .htmlElement((d) => {
          const marker = d as Marker;
          if (marker.kind === "pin") {
            return buildPinElement(marker.pin, {
              isMine: marker.mine,
              onSelect: (pin) => onSelectRef.current?.(pin),
            });
          }
          const el = buildLabelElement(marker.label);
          labelNodesRef.current.push({ el, zoom: marker.label.zoom });
          el.hidden = altitudeRef.current > marker.label.zoom;
          return el;
        })
        // Markers on the far side of the planet must not bleed through.
        .htmlElementVisibilityModifier((el, isVisible) => {
          el.style.opacity = isVisible ? "1" : "0";
          el.style.pointerEvents = isVisible ? "auto" : "none";
        });

      // The ocean: near-black, with just enough specular to catch the light
      // and read as a sphere rather than a flat disc.
      const globeMaterial = globe.globeMaterial() as THREE.MeshPhongMaterial;
      globeMaterial.color = new THREE.Color("#070d18");
      globeMaterial.emissive = new THREE.Color("#04070f");
      globeMaterial.specular = new THREE.Color("#16304d");
      globeMaterial.shininess = 20;

      // Mostly ambient so every continent stays legible, plus a frontal key
      // light for shape. A strong directional would leave half the map dark.
      globe.lights([
        new THREE.AmbientLight(0xffffff, 1.7),
        (() => {
          const key = new THREE.DirectionalLight(0xdce9ff, 1.6);
          key.position.set(0.6, 0.45, 1);
          return key;
        })(),
        (() => {
          const rim = new THREE.DirectionalLight(0x4d7fbe, 0.55);
          rim.position.set(-1, -0.25, -0.55);
          return rim;
        })(),
      ]);

      const controls = globe.controls();
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.rotateSpeed = 0.42;
      controls.zoomSpeed = 0.75;
      controls.minDistance = 105;
      controls.maxDistance = 700;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.22;
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
      });

      globe.pointOfView({ lat: 20, lng: -40, altitude: HOME_ALTITUDE });

      globe.onZoom((pov) => {
        altitudeRef.current = pov.altitude;
        for (const node of labelNodesRef.current) {
          node.el.hidden = pov.altitude > node.zoom;
        }
      });

      globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const handleResize = () => {
        const el = mountRef.current;
        if (!el || !globe) return;
        globe.width(el.clientWidth).height(el.clientHeight);
      };
      window.addEventListener("resize", handleResize);
      detachResize = () => window.removeEventListener("resize", handleResize);

      globeRef.current = globe;
      await applyMarkers();
    })();

    async function applyMarkers() {
      const globeInstance = globeRef.current;
      if (!globeInstance) return;
      const labels = await loadLabels();
      if (disposed) return;
      labelNodesRef.current = [];
      globeInstance.htmlElementsData(buildMarkers(pinsRef.current, draftRef.current, myIdRef.current, labels));
    }

    return () => {
      disposed = true;
      detachResize?.();
      labelNodesRef.current = [];
      const instance = globeRef.current;
      globeRef.current = null;
      if (instance) {
        instance.pauseAnimation();
        instance._destructor();
      }
      if (mount) mount.innerHTML = "";
    };
  }, []);

  // Re-apply markers whenever the pin set or the draft pin changes.
  useEffect(() => {
    let cancelled = false;
    void loadLabels().then((labels) => {
      const globe = globeRef.current;
      if (cancelled || !globe) return;
      labelNodesRef.current = [];
      globe.htmlElementsData(buildMarkers(pins, draft, myUserId, labels));
    });
    return () => {
      cancelled = true;
    };
  }, [pins, draft, myUserId]);

  return <div ref={mountRef} className="h-full w-full" />;
}

function buildMarkers(
  pins: TrollPin[],
  draft: Props["draft"],
  myUserId: string | null,
  labels: GeoLabel[]
): Marker[] {
  const markers: Marker[] = labels.map((label) => ({
    kind: "label",
    id: `label:${label.kind}:${label.name}`,
    lat: label.lat,
    lng: label.lng,
    label,
  }));

  for (const pin of pins) {
    // The draft replaces the saved pin so a user never sees two of themselves.
    if (draft && pin.userId === myUserId) continue;
    markers.push({
      kind: "pin",
      id: `pin:${pin.userId}`,
      lat: pin.lat,
      lng: pin.lng,
      pin,
      mine: pin.userId === myUserId,
    });
  }

  if (draft) {
    markers.push({
      kind: "pin",
      id: "pin:draft",
      lat: draft.lat,
      lng: draft.lng,
      mine: true,
      pin: {
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
      },
    });
  }

  return markers;
}
