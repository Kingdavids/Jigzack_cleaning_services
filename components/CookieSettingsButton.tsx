'use client';

import { GA_ID, setConsent } from "@/lib/analytics";

// Footer link that brings the cookie question back so a visitor can change
// their mind. Hidden when analytics isn't set up.
export default function CookieSettingsButton() {
    if (!GA_ID) return null;

    return (
        <button type="button" onClick={() => setConsent(null)} className="transition hover:text-amber-300">
            Cookie settings
        </button>
    );
}
