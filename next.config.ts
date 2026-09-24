import path from "node:path";
import type { NextConfig } from "next";

// Sensible browser protections for every response. There is no Content
// Security Policy here on purpose: Next's own inline scripts and the analytics
// script need a carefully tuned one, and a wrong policy would break the site.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.join(__dirname),
  },
  // Once the bare domain points at this app, send it to the www address so
  // search engines and visitors only ever see one version of the site.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "jigzackcleaningservices.com" }],
        destination: "https://www.jigzackcleaningservices.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      // Default is 1MB, which rejects the upload outright before the photo
      // form action even runs: a single iPhone photo routinely exceeds it.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
