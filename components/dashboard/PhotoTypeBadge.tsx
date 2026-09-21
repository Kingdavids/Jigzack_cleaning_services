export default function PhotoTypeBadge({ type }: { type: string | null | undefined }) {
    const normalized = (type ?? "").toLowerCase();
    const isBefore = normalized === "before";
    const isAfter = normalized === "after";

    const styles = isBefore
        ? "border-sky-300/40 bg-sky-500 text-white"
        : isAfter
            ? "border-emerald-300/40 bg-emerald-500 text-white"
            : "border-white/20 bg-black/70 text-white/80";

    const label = isBefore ? "Before" : isAfter ? "After" : type || "Photo";

    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] shadow-sm ${styles}`}
        >
            {label}
        </span>
    );
}
