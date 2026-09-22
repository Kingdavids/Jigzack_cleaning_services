'use client';

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

function formatElapsed(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, "0");

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export default function TaskTimer({ startedAt }: { startedAt: string }) {
    const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());

    useEffect(() => {
        const startMs = new Date(startedAt).getTime();
        const interval = setInterval(() => setElapsed(Date.now() - startMs), 1000);
        return () => clearInterval(interval);
    }, [startedAt]);

    return (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm font-semibold tabular-nums text-amber-300">
            <Timer className="h-4 w-4" />
            {formatElapsed(elapsed)}
        </span>
    );
}
