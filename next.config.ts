import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Default is 1MB, which rejects the upload outright before the photo
      // form action even runs — a single iPhone photo routinely exceeds it.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
