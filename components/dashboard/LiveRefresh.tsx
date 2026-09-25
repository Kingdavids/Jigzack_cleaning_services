'use client';

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

// Keeps a server-rendered page current. When something changes in the given
// tables (a pickup is serviced, an invoice is paid, a photo is uploaded) the
// page reloads its data a moment later, and it also refreshes when the app
// comes back to the front. Nothing is shown; it only refreshes.
export default function LiveRefresh({ tables }: { tables: string[] }) {
    const router = useRouter();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // A stable key, so the subscription is only rebuilt if the list really changes.
    const key = tables.join(",");

    useEffect(() => {
        const supabase = createClient();

        const refreshSoon = () => {
            // A burst of changes (ten photos, a batch of pickups) refreshes once.
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => router.refresh(), 700);
        };

        let channel = supabase.channel(`live-refresh-${key}`);

        for (const table of key.split(",")) {
            channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refreshSoon);
        }

        channel.subscribe();

        const onVisible = () => {
            if (document.visibilityState === "visible") refreshSoon();
        };

        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);

        return () => {
            supabase.removeChannel(channel);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [key, router]);

    return null;
}
