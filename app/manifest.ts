import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jigzack Cleaning Services",
    short_name: "Jigzack",
    description: "LAWMA-approved waste collection for homes and businesses in Lagos and Port Harcourt.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/icon.png", type: "image/png", sizes: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "any", purpose: "any" },
    ],
  };
}
