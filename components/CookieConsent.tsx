'use client';

import { useSyncExternalStore } from "react";
import Link from "next/link";
import Script from "next/script";
import { GA_ID, disableAnalytics, readConsent, setConsent, subscribeConsent, type Consent } from "@/lib/analytics";

// Asks once, remembers the answer in the browser, and only then loads Google
// Analytics. It renders nothing at all until an analytics ID is configured.
export default function CookieConsent() {
    // "unknown" on the server and during hydration, so nothing flashes.
    const consent = useSyncExternalStore<Consent | "unknown">(subscribeConsent, readConsent, () => "unknown");

    if (!GA_ID || consent === "unknown") return null;

    if (consent === "granted") {
        return (
            <>
                <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
                <Script id="ga-init" strategy="afterInteractive">
                    {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
                </Script>
            </>
        );
    }

    if (consent === "denied") return null;

    return (
        <div
            role="dialog"
            aria-label="Cookie choice"
            className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0b10]/95 px-4 py-4 backdrop-blur md:px-8"
        >
            <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm leading-relaxed text-white/75">
                    We&apos;d like to use analytics cookies to see which pages are useful. Nothing loads unless you
                    say yes.{" "}
                    <Link href="/privacy#cookies" className="font-semibold text-amber-300 underline underline-offset-2">
                        How we use cookies
                    </Link>
                </p>
                <div className="flex shrink-0 gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            disableAnalytics();
                            setConsent("denied");
                        }}
                        className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                        No thanks
                    </button>
                    <button
                        type="button"
                        onClick={() => setConsent("granted")}
                        className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
