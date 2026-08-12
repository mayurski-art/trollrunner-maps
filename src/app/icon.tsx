import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
// Rendered once at build time so the static export can emit it as a file.
export const dynamic = "force-static";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e1219",
          borderRadius: 7,
          fontSize: 20,
        }}
      >
        📍
      </div>
    ),
    size
  );
}
