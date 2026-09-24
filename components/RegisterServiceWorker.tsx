'use client';

import { useEffect } from "react";

// Registers the offline page helper (public/sw.js). Production only, so the
// development server is never affected by a cached worker.
export default function RegisterServiceWorker() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

        navigator.serviceWorker.register("/sw.js").catch((err) => {
            console.error("Service worker registration failed:", err);
        });
    }, []);

    return null;
}
