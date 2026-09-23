import { renderOgImage } from "@/lib/og-image";

export const alt = "Jigzack Cleaning Services: LAWMA-approved waste collection in Lagos and Port Harcourt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
    return renderOgImage();
}
