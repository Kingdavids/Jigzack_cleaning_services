"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
    BriefcaseBusiness,
    CheckCircle2,
    LoaderCircle,
    MailCheck,
    ShieldCheck,
    Sparkles,
    UserRound,
} from "lucide-react";

type Role = "customer" | "employee" | "admin";
type ProfileStatus = "pending" | "approved" | "declined";

export default function PendingClient({
                                          userId,
                                          role,
                                          emailVerified,
                                          fullName,
                                          initialStatus,
                                      }: {
    userId: string;
    role: Role;
    emailVerified: boolean;
    fullName?: string;
    initialStatus: ProfileStatus;
}) {
    const router = useRouter();
    const supabase = createClient();

    const [status, setStatus] = useState<ProfileStatus>(initialStatus);
    const [activeStage, setActiveStage] = useState(0);
    const redirectedRef = useRef(false);
    const isRedirecting = status === "declined" || (status === "approved" && emailVerified);

    const stages = useMemo(() => {
        if (role === "employee") {
            return [
                "Account created",
                "Email verification required",
                "Profile details received",
                "Access review in progress",
                "Employee workspace activation",
            ];
        }

        return [
            "Account created",
            "Email verification required",
            "Profile details received",
            "Account review in progress",
            "Customer dashboard activation",
        ];
    }, [role]);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveStage((prev) => (prev + 1) % stages.length);
        }, 1800);

        return () => clearInterval(interval);
    }, [stages.length]);

    useEffect(() => {
        if (redirectedRef.current) return;

        if (status === "approved" && emailVerified) {
            redirectedRef.current = true;
            router.push(`/auth/success?role=${role}`);
            return;
        }

        if (status === "declined") {
            redirectedRef.current = true;
            router.push("/auth/decline");
        }
    }, [status, emailVerified, role, router]);

    useEffect(() => {
        const channel = supabase
            .channel(`profile-status-${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "profiles",
                    filter: `id=eq.${userId}`,
                },
                (payload) => {
                    const nextStatus = payload.new?.status as ProfileStatus | undefined;
                    if (nextStatus) {
                        setStatus(nextStatus);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, userId]);

    const content = useMemo(() => {
        if (role === "employee") {
            return {
                badge: "Employee Account Review",
                heading: "Your account is under review",
                subtitle:
                    "We\u2019ve received your details. Our team is reviewing them, and your dashboard opens once you\u2019re approved.",
                note: emailVerified
                    ? "Your email is verified. Your account is now waiting for admin approval."
                    : "Please confirm your email using the link we sent. Admin approval can only happen after your email is confirmed.",
                icon: BriefcaseBusiness,
            };
        }

        return {
            badge: "Customer Account Review",
            heading: "Your account is under review",
            subtitle:
                "We\u2019ve received your details. Our team is reviewing them, and your dashboard opens once you\u2019re approved.",
            note: emailVerified
                ? "Your email is verified. Your account is now waiting for admin approval."
                : "Please confirm your email using the link we sent. Admin approval can only happen after your email is confirmed.",
            icon: UserRound,
        };
    }, [role, emailVerified]);

    const MainIcon = content.icon;
    const effectiveStage = emailVerified ? Math.max(activeStage, 2) : activeStage;

    return (
        <div className="min-h-screen bg-[#0a0a0b] text-white">
            <div className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-10 md:px-6 lg:px-8">
                <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.92fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-10">
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">
                            <Sparkles className="h-4 w-4" />
                            {content.badge}
                        </div>

                        <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl md:leading-[1.02]">
                            {content.heading}
                        </h1>

                        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65 md:text-base">
                            {fullName ? `Hi ${fullName}, ` : ""}
                            {content.subtitle}
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="/"
                                className="rounded-2xl border border-white/12 bg-white/6 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/20"
                            >
                                Back to Home
                            </Link>

                            <Link
                                href="/auth"
                                className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-300"
                            >
                                Go to Login
                            </Link>
                        </div>

                        <div className="mt-10 grid gap-4 md:grid-cols-2">
                            <div className="group rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-amber-300/20 hover:bg-white/[0.05]">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 transition group-hover:scale-105">
                                        <ShieldCheck className="h-5 w-5 text-amber-300" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">Approval status</p>
                                        <p className="text-xs text-white/45">
                                            {status === "pending" ? "Waiting in the approval queue" : "Updated automatically"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="group rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-amber-300/20 hover:bg-white/[0.05]">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 transition group-hover:scale-105">
                                        <MailCheck className="h-5 w-5 text-amber-300" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">
                                            {emailVerified ? "Email verified" : "Email confirmation required"}
                                        </p>
                                        <p className="text-xs text-white/45">
                                            {emailVerified
                                                ? "Your email is confirmed"
                                                : "Use the verification link sent to your inbox"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 rounded-[30px] border border-white/10 bg-black/20 p-5">
                            <p className="text-xs uppercase tracking-[0.22em] text-white/40">What happens next</p>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                {[
                                    "Verify your email address",
                                    "Your account is reviewed",
                                    "Access is activated",
                                ].map((item, index) => (
                                    <div
                                        key={item}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4"
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                                            Step 0{index + 1}
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-white/80">{item}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-10">
                        <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-400/10">
                            <MainIcon className="h-9 w-9 text-amber-300" />
                        </div>

                        <div className="mt-8 text-center">
                            <p className="text-xs uppercase tracking-[0.25em] text-white/40">Status</p>
                            <h2 className="mt-3 text-2xl font-black text-white md:text-3xl">
                                {isRedirecting ? "Opening your dashboard" : "Waiting for approval"}
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-white/60">
                                {content.note}
                            </p>
                        </div>

                        <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/8">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400 transition-all duration-700"
                                style={{ width: `${((effectiveStage + 1) / stages.length) * 100}%` }}
                            />
                        </div>

                        <div className="mt-8 space-y-4">
                            {stages.map((stage, index) => {
                                const isActive = index === effectiveStage;
                                const isDone = index < effectiveStage;

                                return (
                                    <div
                                        key={stage}
                                        className={`flex items-center gap-4 rounded-2xl border px-4 py-4 transition-all duration-500 ${
                                            isActive
                                                ? "border-amber-300/30 bg-amber-400/10 shadow-[0_0_32px_rgba(250,204,21,0.08)]"
                                                : "border-white/10 bg-black/20"
                                        }`}
                                    >
                                        <div
                                            className={`flex h-11 w-11 items-center justify-center rounded-2xl transition ${
                                                isDone || isActive ? "bg-amber-400/15" : "bg-white/6"
                                            }`}
                                        >
                                            {isDone ? (
                                                <CheckCircle2 className="h-5 w-5 text-amber-300" />
                                            ) : isActive ? (
                                                <LoaderCircle className="h-5 w-5 animate-spin text-amber-300" />
                                            ) : index === 1 ? (
                                                <MailCheck className="h-5 w-5 text-white/50" />
                                            ) : (
                                                <span className="text-sm font-bold text-white/45">{index + 1}</span>
                                            )}
                                        </div>

                                        <div className="flex-1">
                                            <p className="font-semibold text-white">{stage}</p>
                                            <p className="mt-1 text-sm text-white/50">
                                                {isActive ? "Currently in progress" : isDone ? "Completed" : "Waiting"}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5">
                            <p className="text-xs uppercase tracking-[0.22em] text-white/40">Helpful Note</p>
                            <p className="mt-3 text-sm leading-6 text-white/65">
                                {!emailVerified
                                    ? "Check your inbox and confirm your email first. Approval only happens after your email is confirmed and an admin has reviewed your account."
                                    : "Your email is already confirmed. The only step left is admin approval. This page updates by itself as soon as your status changes."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}