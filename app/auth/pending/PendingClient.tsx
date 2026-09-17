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
    Settings,
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
    const [isRedirecting, setIsRedirecting] = useState(false);
    const redirectedRef = useRef(false);

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
            setIsRedirecting(true);
            router.push(`/auth/success?role=${role}`);
            return;
        }

        if (status === "declined") {
            redirectedRef.current = true;
            setIsRedirecting(true);
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
                heading: "Your employee account is being prepared",
                subtitle:
                    "We’ve received your account details and employment profile. Our team is reviewing your access and preparing your workspace before your dashboard is activated.",
                note: emailVerified
                    ? "Your email has been verified successfully. Your account is now waiting for final admin approval."
                    : "Please verify your email address using the link sent to your inbox. Admin approval can only be completed after email confirmation.",
                icon: BriefcaseBusiness,
            };
        }

        return {
            badge: "Customer Account Review",
            heading: "Your customer account is being prepared",
            subtitle:
                "We’ve received your account details and property profile. Our team is reviewing your setup and preparing your service access before your dashboard is activated.",
            note: emailVerified
                ? "Your email has been verified successfully. Your account is now waiting for final admin approval."
                : "Please verify your email address using the link sent to your inbox. Admin approval can only be completed after email confirmation.",
            icon: UserRound,
        };
    }, [role, emailVerified]);

    const MainIcon = content.icon;
    const effectiveStage = emailVerified ? Math.max(activeStage, 2) : activeStage;

    return (
        <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,_#060606_0%,_#0b0c0f_35%,_#111318_65%,_#161922_100%)] text-white">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[6%] top-[10%] h-52 w-52 animate-pulse rounded-full bg-amber-400/10 blur-3xl" />
                <div className="absolute right-[8%] top-[16%] h-72 w-72 animate-pulse rounded-full bg-orange-400/10 blur-3xl [animation-delay:600ms]" />
                <div className="absolute bottom-[8%] left-[15%] h-56 w-56 animate-pulse rounded-full bg-yellow-300/10 blur-3xl [animation-delay:1200ms]" />
                <div className="absolute bottom-[18%] right-[12%] h-44 w-44 animate-pulse rounded-full bg-white/5 blur-3xl [animation-delay:900ms]" />

                <div className="absolute left-[12%] top-[24%] h-2 w-2 rounded-full bg-amber-300/70 shadow-[0_0_22px_rgba(252,211,77,0.9)] animate-bounce" />
                <div className="absolute right-[18%] top-[30%] h-2.5 w-2.5 rounded-full bg-orange-300/70 shadow-[0_0_22px_rgba(253,186,116,0.9)] animate-bounce [animation-delay:300ms]" />
                <div className="absolute left-[22%] bottom-[22%] h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_18px_rgba(255,255,255,0.8)] animate-bounce [animation-delay:700ms]" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-4 py-10 md:px-6 lg:px-8">
                <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.92fr]">
                    <div className="rounded-[36px] border border-white/10 bg-white/[0.06] p-7 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:p-10">
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
                                        <p className="text-sm font-semibold text-white">Secure verification active</p>
                                        <p className="text-xs text-white/45">
                                            {status === "pending" ? "Your account is in the approval queue" : "Status updated in real time"}
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
                                                ? "Your email has been confirmed successfully"
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

                    <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-white/[0.06] p-7 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:p-10">
                        <div className="pointer-events-none absolute right-6 top-6 opacity-25">
                            <Settings className="h-16 w-16 text-amber-300 animate-spin [animation-duration:14s]" />
                        </div>

                        <div className="pointer-events-none absolute right-16 top-20 opacity-20">
                            <Settings className="h-10 w-10 text-white animate-spin [animation-duration:10s] [animation-direction:reverse]" />
                        </div>

                        <div className="pointer-events-none absolute left-[-18px] bottom-12 opacity-10">
                            <Settings className="h-24 w-24 text-white animate-spin [animation-duration:18s]" />
                        </div>

                        <div className="relative mx-auto mt-2 flex h-32 w-32 items-center justify-center">
                            <div className="absolute h-32 w-32 animate-pulse rounded-full bg-amber-400/10 blur-2xl" />
                            <div className="absolute h-28 w-28 rounded-full border border-white/10 bg-white/[0.04]" />
                            <div className="absolute h-20 w-20 rounded-full border border-amber-300/20 bg-amber-400/10" />
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-transparent">
                                <MainIcon className="h-10 w-10 animate-pulse text-amber-300" />
                            </div>
                        </div>

                        <div className="mt-8 text-center">
                            <p className="text-xs uppercase tracking-[0.25em] text-white/40">Live Review Flow</p>
                            <h2 className="mt-3 text-2xl font-black text-white md:text-3xl">
                                {isRedirecting ? "Finalizing your access" : "Your account is moving through approval"}
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
                                    ? "Please check your inbox and confirm your email address before returning. Approval can only be completed after email confirmation and admin review."
                                    : "Your email has already been confirmed. The remaining step is final admin approval. This page will update automatically as soon as your status changes."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}