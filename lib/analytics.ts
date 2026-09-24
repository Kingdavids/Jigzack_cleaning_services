// Cookie choice and event tracking. Analytics only loads after a visitor
// says yes (see components/CookieConsent.tsx), so every call here is a quiet
// no-op for anyone who declined or hasn't chosen yet.

export const CONSENT_KEY = "jigzack-cookie-consent";
export const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "")
    ? (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID as string)
    : null;

export type Consent = "granted" | "denied" | null;

const CHANGE_EVENT = "jigzack-consent-change";

declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
    }
}

export function readConsent(): Consent {
    try {
        const value = window.localStorage.getItem(CONSENT_KEY);
        return value === "granted" || value === "denied" ? value : null;
    } catch {
        return null;
    }
}

export function setConsent(value: Consent) {
    try {
        if (value) window.localStorage.setItem(CONSENT_KEY, value);
        else window.localStorage.removeItem(CONSENT_KEY);
    } catch {
        // Private browsing can refuse storage; the choice then lasts until reload.
    }

    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeConsent(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);

    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
    };
}

// Tells Google's script to stop collecting for the rest of this page view.
export function disableAnalytics() {
    if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", name, params);
}
