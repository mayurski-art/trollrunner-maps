import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrollRunner Maps",
    short_name: "Maps",
    description:
      "A living map of the troll diaspora. Drop a pin where you're from and see every other troll on the globe.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070c",
    theme_color: "#05070c",
    icons: [{ src: "/icon", sizes: "32x32", type: "image/png" }],
  };
}
