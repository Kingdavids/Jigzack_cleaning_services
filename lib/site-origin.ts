import { headers } from "next/headers";

// Public origin of the site, for links inside emails. Behind Railway's proxy
// the request URL is the internal address, so prefer the configured site URL
// and then the forwarded headers.
export async function siteOrigin() {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

    return host ? `${proto}://${host}` : "";
}
