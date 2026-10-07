import { signInText, type EmailStatus } from "@/lib/admin/emailStatus";

// Whether someone's email is confirmed, for the owner. Nothing is drawn when the
// status isn't known (not the owner, or the service key isn't set).
export default function EmailStatusBadge({ status, showSignIn = false }: { status: EmailStatus | undefined; showSignIn?: boolean }) {
    if (!status) return null;

    return (
        <span className="inline-flex flex-wrap items-center gap-2">
            <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    status.confirmed ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/15 text-amber-300"
                }`}
            >
                {status.confirmed ? "Email confirmed" : "Email not confirmed"}
            </span>
            {showSignIn && <span className="text-[11px] text-white/45">{signInText(status)}</span>}
        </span>
    );
}

// Shown once to the owner when the statuses can't be read.
export function EmailStatusUnavailable() {
    return (
        <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs text-amber-100">
            Email confirmation status can&apos;t be read yet. Add <code>SUPABASE_SERVICE_ROLE_KEY</code> to the server&apos;s environment variables (Railway) to turn it on.
        </p>
    );
}
