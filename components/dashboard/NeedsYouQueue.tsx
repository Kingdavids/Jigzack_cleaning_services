'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { setRegistrationFee, clearInvoiceTransferReport } from "@/app/admin/customer-actions";
import { recordPayment } from "@/app/admin/actions/payments";
import { reviewExpense } from "@/app/admin/actions/expenses";
import { naira } from "@/lib/customer/billing";
import ConfirmDialog from "@/components/dashboard/ConfirmDialog";

export type FeeItem = { profileId: string; name: string; reportedAt: string; note: string | null; receiptUrl: string | null };
export type TransferItem = { paymentId: string; name: string; month: string; balance: number; reportedAt: string; note: string | null; receiptUrl: string | null };
export type ExpenseItem = { id: string; name: string; amount: number; category: string; date: string; note: string | null };
export type LinkItem = { label: string; detail: string; href: string };

type Props = {
    fees: FeeItem[];
    feeTotal: number;
    transfers: TransferItem[];
    transferTotal: number;
    expenses: ExpenseItem[];
    expenseTotal: number;
    // What needs a look but is decided on its own page: sign-ups, pickups, messages.
    links: LinkItem[];
    // Supervisors can look but not change anything.
    canAct: boolean;
};

const button = "rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50";
const good = `${button} bg-emerald-500 text-black hover:bg-emerald-400`;
const neutral = `${button} border border-white/15 text-white/80 hover:bg-white/10`;
const bad = `${button} border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`;

function Group({ title, count, more, href, children }: { title: string; count: number; more: number; href: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">
                {title} ({count})
            </p>
            <ul className="space-y-2">{children}</ul>
            {more > 0 && (
                <Link href={href} className="mt-2 inline-block text-xs font-semibold text-amber-300 underline underline-offset-2">
                    {more} more waiting. See them all
                </Link>
            )}
        </div>
    );
}

function Row({ children }: { children: React.ReactNode }) {
    return <li className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">{children}</li>;
}

function Proof({ url }: { url: string | null }) {
    return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-amber-300 underline underline-offset-2">
            View proof
        </a>
    ) : (
        <span className="text-white/40">No proof attached</span>
    );
}

function FeeRow({ item, canAct }: { item: FeeItem; canAct: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState<"confirm" | "waive" | "reject" | null>(null);

    const run = async (action: "confirm" | "waive" | "reject") => {
        setBusy(action);
        const result = await setRegistrationFee(item.profileId, action, "");
        setBusy(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(result.message ?? "Done");
        router.refresh();
    };

    return (
        <Row>
            <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">{item.name}</p>
                <p className="text-xs text-white/55">
                    Says they paid the registration fee, {item.reportedAt}. <Proof url={item.receiptUrl} />
                </p>
                {item.note && <p className="text-xs text-white/55">Note: {item.note}</p>}
            </div>
            {canAct && (
                <div className="flex flex-wrap gap-2">
                    <button disabled={busy !== null} onClick={() => run("confirm")} className={good}>
                        {busy === "confirm" ? "Saving..." : "Confirm paid"}
                    </button>
                    <button disabled={busy !== null} onClick={() => run("waive")} className={neutral}>
                        {busy === "waive" ? "Saving..." : "Existing customer, no fee"}
                    </button>
                    <button disabled={busy !== null} onClick={() => run("reject")} className={bad}>
                        {busy === "reject" ? "Saving..." : "Not received"}
                    </button>
                </div>
            )}
        </Row>
    );
}

function TransferRow({ item, canAct }: { item: TransferItem; canAct: boolean }) {
    const router = useRouter();
    const [asking, setAsking] = useState<"confirm" | "reject" | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!asking) return;

        setBusy(true);
        const result =
            asking === "confirm"
                ? await recordPayment(item.paymentId, item.balance, "Bank transfer", "", "Confirmed from the dashboard")
                : await clearInvoiceTransferReport(item.paymentId);
        setBusy(false);
        setAsking(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(asking === "confirm" ? "Payment recorded" : "Cleared");
        router.refresh();
    };

    return (
        <Row>
            <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">
                    {item.name} · <span className="text-amber-300">{naira(item.balance)}</span>
                </p>
                <p className="text-xs text-white/55">
                    Says they paid the {item.month} invoice by transfer, {item.reportedAt}. <Proof url={item.receiptUrl} />
                </p>
                {item.note && <p className="text-xs text-white/55">Note: {item.note}</p>}
            </div>
            {canAct && (
                <div className="flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => setAsking("confirm")} className={good}>
                        Confirm payment
                    </button>
                    <button disabled={busy} onClick={() => setAsking("reject")} className={bad}>
                        Not received
                    </button>
                </div>
            )}
            <ConfirmDialog
                open={asking !== null}
                title={asking === "confirm" ? `Record ${naira(item.balance)} as received?` : "Mark this transfer as not received?"}
                confirmLabel={asking === "confirm" ? "Yes, I have checked my account" : "Yes, not received"}
                tone={asking === "confirm" ? "default" : "danger"}
                busy={busy}
                onConfirm={run}
                onCancel={() => setAsking(null)}
            >
                <p>
                    {asking === "confirm"
                        ? `This records the full balance for ${item.name} as paid by bank transfer and makes a receipt. To record a part payment, use Payments instead.`
                        : "The customer can report it again."}
                </p>
            </ConfirmDialog>
        </Row>
    );
}

function ExpenseRow({ item, canAct }: { item: ExpenseItem; canAct: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

    const decide = async (status: "approved" | "rejected") => {
        setBusy(status);
        const result = await reviewExpense(item.id, status, "");
        setBusy(null);

        if (!result.success) {
            toast.error(result.error ?? "Something went wrong.");
            return;
        }

        toast.success(status === "approved" ? "Expense approved" : "Expense rejected");
        router.refresh();
    };

    return (
        <Row>
            <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">
                    {item.name} · <span className="text-amber-300">{naira(item.amount)}</span> <span className="capitalize text-white/55">{item.category}</span>
                </p>
                <p className="text-xs text-white/55">
                    {item.date}
                    {item.note ? ` · ${item.note}` : ""}
                </p>
            </div>
            {canAct && (
                <div className="flex flex-wrap gap-2">
                    <button disabled={busy !== null} onClick={() => decide("approved")} className={good}>
                        {busy === "approved" ? "Saving..." : "Approve"}
                    </button>
                    <button disabled={busy !== null} onClick={() => decide("rejected")} className={bad}>
                        {busy === "rejected" ? "Saving..." : "Reject"}
                    </button>
                </div>
            )}
        </Row>
    );
}

// What needs a decision right now, with the buttons to make it, so most days an
// admin never has to open another page. Anything that needs more care opens
// its own page from a link.
export default function NeedsYouQueue({ fees, feeTotal, transfers, transferTotal, expenses, expenseTotal, links, canAct }: Props) {
    const nothing = fees.length + transfers.length + expenses.length + links.length === 0;

    return (
        <section aria-label="Needs you now" className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-5">
            <h2 className="mb-4 text-base font-bold tracking-tight">
                Needs you now<span className="text-amber-300">.</span>
            </h2>

            {nothing ? (
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    You&apos;re all caught up. Nothing is waiting for a decision.
                </p>
            ) : (
                <div className="space-y-5">
                    {transfers.length > 0 && (
                        <Group title="Invoice transfers to confirm" count={transferTotal} more={transferTotal - transfers.length} href="/admin/payments">
                            {transfers.map((item) => (
                                <TransferRow key={item.paymentId} item={item} canAct={canAct} />
                            ))}
                        </Group>
                    )}
                    {fees.length > 0 && (
                        <Group title="Registration fees to confirm" count={feeTotal} more={feeTotal - fees.length} href="/admin/payments#registration-fees">
                            {fees.map((item) => (
                                <FeeRow key={item.profileId} item={item} canAct={canAct} />
                            ))}
                        </Group>
                    )}
                    {expenses.length > 0 && (
                        <Group title="Staff expenses to review" count={expenseTotal} more={expenseTotal - expenses.length} href="/admin/expenses">
                            {expenses.map((item) => (
                                <ExpenseRow key={item.id} item={item} canAct={canAct} />
                            ))}
                        </Group>
                    )}
                    {links.length > 0 && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-amber-300">Also waiting</p>
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {links.map((item) => (
                                    <li key={item.label}>
                                        <Link href={item.href} className="block rounded-xl border border-white/10 bg-black/20 p-3 text-sm transition hover:bg-white/[0.06]">
                                            <span className="font-semibold">{item.label}</span>
                                            <span className="block text-xs text-white/55">{item.detail}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
