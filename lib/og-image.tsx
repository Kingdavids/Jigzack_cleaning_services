import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

// The share card used for link previews on WhatsApp, LinkedIn, Facebook, X
// and search results: logo, name, what we do and where.
export async function renderOgImage() {
    const logo = await readFile(path.join(process.cwd(), "public/images/logo-mark.png"));
    const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "64px 72px",
                    background: "linear-gradient(135deg, #020617 0%, #0f172a 60%, #1e293b 100%)",
                    color: "#ffffff",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoSrc} width={84} height={84} alt="" />
                    <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
                        Jigzack<span style={{ color: "#fcd34d" }}>.</span>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div
                        style={{
                            display: "flex",
                            alignSelf: "flex-start",
                            padding: "8px 20px",
                            borderRadius: 999,
                            border: "2px solid rgba(252,211,77,0.4)",
                            background: "rgba(251,191,36,0.12)",
                            color: "#fcd34d",
                            fontSize: 26,
                            fontWeight: 700,
                            letterSpacing: 4,
                        }}
                    >
                        LAWMA APPROVED
                    </div>
                    <div style={{ display: "flex", fontSize: 76, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2 }}>
                        Waste collection for homes and businesses
                    </div>
                    <div style={{ display: "flex", fontSize: 34, color: "rgba(255,255,255,0.7)" }}>
                        Lagos and Port Harcourt. Scheduled pickups, invoices and receipts online.
                    </div>
                </div>

                <div style={{ display: "flex", fontSize: 28, color: "#fcd34d", fontWeight: 700 }}>
                    jigzackcleaningservices.com
                </div>
            </div>
        ),
        { ...OG_SIZE }
    );
}
