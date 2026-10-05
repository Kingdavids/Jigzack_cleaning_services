import { Ban } from "lucide-react";

// Marks a suspended customer (status "inactive") wherever they appear, so
// nobody mistakes them for an active account.
export default function SuspendedTag({ className = "" }: { className?: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300 ${className}`}
        >
            <Ban className="h-3 w-3" />
            Suspended
        </span>
    );
}

export const isSuspended = (status: string | null | undefined) => status === "inactive";
