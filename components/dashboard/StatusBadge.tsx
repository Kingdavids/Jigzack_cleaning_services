export default function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        pending: "border-yellow-400/20 bg-yellow-400/10 text-yellow-300",
        in_progress: "border-sky-400/20 bg-sky-400/10 text-sky-300",
        completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        declined: "border-red-400/20 bg-red-400/10 text-red-300",
        paid: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        failed: "border-red-400/20 bg-red-400/10 text-red-300",
        active: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        inactive: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
        submitted: "border-yellow-400/20 bg-yellow-400/10 text-yellow-300",
        approved: "border-sky-400/20 bg-sky-400/10 text-sky-300",
        reimbursed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        rejected: "border-red-400/20 bg-red-400/10 text-red-300",
        deleted: "border-red-400/20 bg-red-400/10 text-red-300",
    };

    return (
        <span
            className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] ${
                map[status] || "border-white/10 bg-white/10 text-white"
            }`}
        >
      {status.replace("_", " ")}
    </span>
    );
}