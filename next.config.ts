import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a plain static site into out/ — nothing here needs a server, so
  // GitHub Pages can host it straight from the build artifact.
  output: "export",
  images: { unoptimized: true },
  // Pages serves /foo as /foo/index.html.
  trailingSlash: true,
};

export default nextConfig;
