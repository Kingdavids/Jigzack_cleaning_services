import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Jigzack Cleaning Services",
    short_name: "Jigzack",
    description: "LAWMA-approved waste collection for homes and businesses in Lagos and Port Harcourt.",
    lang: "en-NG",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#020617",
    theme_color: "#020617",
    categories: ["business", "utilities"],
    // Separate 192 and 512 icons are what Android needs to offer "Install app".
    // The maskable one has extra room around the drop, so Android can crop it to
    // a circle or rounded square without cutting the logo.
    icons: [
      { src: "/icons/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icons/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icons/maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
    // Long-press the icon on Android for these.
    shortcuts: [
      {
        name: "My schedule",
        short_name: "Schedule",
        description: "Your pickup dates and photos",
        url: "/customer/schedule",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Payments",
        short_name: "Payments",
        description: "Invoices and receipts",
        url: "/customer/payments",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Messages",
        short_name: "Messages",
        description: "Talk to the Jigzack team",
        url: "/customer/messages",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Contact us",
        short_name: "Contact",
        description: "Call or send a message",
        url: "/contact",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
