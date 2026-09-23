"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MailCheck, ShieldCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailClient({ email }: { email: string }) {
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleResend = async () => {
        if (!email || cooldown > 0 || sending) return;

        setSending(true);

        const { error } = await createClient().auth.resend({
            type: "signup",
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback?next=/auth/complete-signup`,
            },
        });

        setSending(false);

        if (error) {
            toast.error(error.message || "Could not resend the email. Please try again shortly.");
            return;
        }

        toast.success("Confirmation email sent again.");
        setCooldown(RESEND_COOLDOWN_SECONDS);
    };

    const steps = [
        { icon: MailCheck, title: "Confirm your email", body: "Open the message we just sent and tap the confirmation link." },
        { icon: UserCheck, title: "Finish your profile", body: "After confirming, you'll be asked for a few details." },
        { icon: ShieldCheck, title: "Wait for approval", body: "An admin reviews your account, then your dashboard unlocks." },
    ];

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-4 py-10 text-white">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-9">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/10">
                    <MailCheck className="h-8 w-8 text-amber-300" />
                </div>

                <h1 className="mt-6 text-center text-3xl font-black tracking-tight">Check your email</h1>

                <p className="mt-3 text-center text-sm leading-6 text-white/65">
                    We sent a confirmation link to
                    {email ? (
                        <>
                            {" "}
                            <span className="font-semibold text-white">{email}</span>.
                        </>
                    ) : (
                        " your email address."
                    )}{" "}
                    You need to open it before you can sign in.
                </p>

                <div className="mt-6 space-y-3">
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <div
                                key={step.title}
                                className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4"
                            >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/10">
                                    <Icon className="h-4 w-4 text-amber-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">
                                        {index + 1}. {step.title}
                                    </p>
                                    <p className="mt-0.5 text-xs leading-5 text-white/55">{step.body}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-white/50">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
                    Can&apos;t find it? Check your spam or promotions folder, or resend it below.
                </p>

                <button
                    type="button"
                    onClick={handleResend}
                    disabled={!email || cooldown > 0 || sending}
                    className="mt-5 w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {sending
                        ? "Sending…"
                        : cooldown > 0
                            ? `Resend email in ${cooldown}s`
                            : "Resend confirmation email"}
                </button>

                <div className="mt-5 flex items-center justify-between text-xs text-white/50">
                    <Link href="/auth?mode=signup" className="transition hover:text-amber-300">
                        Wrong email? Sign up again
                    </Link>
                    <Link href="/auth" className="transition hover:text-amber-300">
                        Already confirmed? Log in
                    </Link>
                </div>
            </div>
        </main>
    );
}
