"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    CheckCircle2,
    CircleAlert,
    LifeBuoy,
    Mail,
    ShieldX,
    BriefcaseBusiness,
    UserRound,
} from "lucide-react";

export default function DeclinePage() {
    return (
        <Suspense fallback={null}>
            <DeclineContent />
        </Suspense>
    );
}

function DeclineContent() {
    const searchParams = useSearchParams();
    const role = searchParams.get("role") === "employee" ? "employee" : "customer";

    const content =
        role === "employee"
            ? {
                badge: "Employee Review Result",
                heading: "We’re unable to activate this employee account",
                subtitle:
                    "Thank you for your interest in joining Jigzack. After review, we’re unable to approve this employee account at this time, so workspace access has not been enabled.",
                reviewText:
                    "This outcome may be related to submitted account details, verification status, or internal access requirements for employee onboarding.",
                supportText:
                    "If you believe this decision was made in error or you need further clarification, please contact support for assistance.",
                inactiveTitle: "Workspace inactive",
                inactiveDesc: "Employee dashboard access has not been enabled",
                supportTitle: "Support available",
                supportDesc: "Reach out if you believe this needs review",
                icon: BriefcaseBusiness,
            }
            : {
                badge: "Customer Review Result",
                heading: "We’re unable to activate this customer account",
                subtitle:
                    "Thank you for your interest in Jigzack. After review, we’re unable to approve this customer account at this time, so dashboard and service access have not been enabled.",
                reviewText:
                    "This outcome may be related to submitted account details, verification status, or service setup requirements connected to the account.",
                supportText:
                    "If you believe this decision was made in error or you need further clarification, please contact support for assistance.",
                inactiveTitle: "Access inactive",
                inactiveDesc: "Customer dashboard access has not been enabled",
                supportTitle: "Support available",
                supportDesc: "Reach out if you believe this needs review",
                icon: UserRound,
            };

    const MainIcon = content.icon;

    return (
        <div className="min-h-screen bg-[#0a0a0b] text-white">
            <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 md:px-6 lg:px-8">
                <div className="grid w-full gap-6 lg:grid-cols-[1.08fr_0.92fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-10">
                        <div className="inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-300">
                            <CircleAlert className="h-4 w-4" />
                            {content.badge}
                        </div>

                        <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl md:leading-[1.02]">
                            {content.heading}
                        </h1>

                        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65 md:text-base">
                            {content.subtitle}
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="/"
                                className="rounded-2xl border border-white/12 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/20"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    Back to Home
                                </span>
                            </Link>

                            <Link
                                href="/auth"
                                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-white/90"
                            >
                                Go to Login
                            </Link>
                        </div>

                        <div className="mt-10 grid gap-4 md:grid-cols-2">
                            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-red-300/20 hover:bg-white/[0.05]">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-400/15">
                                        <ShieldX className="h-5 w-5 text-red-300" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">
                                            {content.inactiveTitle}
                                        </p>
                                        <p className="text-xs text-white/45">
                                            {content.inactiveDesc}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-orange-300/20 hover:bg-white/[0.05]">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-400/15">
                                        <LifeBuoy className="h-5 w-5 text-orange-300" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">
                                            {content.supportTitle}
                                        </p>
                                        <p className="text-xs text-white/45">
                                            {content.supportDesc}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
                            <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                                What you can do next
                            </p>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                {[
                                    "Review your submitted details",
                                    "Contact support if needed",
                                    "Reapply if instructed",
                                ].map((item, index) => (
                                    <div
                                        key={item}
                                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4"
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                                            Option 0{index + 1}
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-white/80">
                                            {item}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 md:p-10">
                        <div className="mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-400/10">
                            <MainIcon className="h-9 w-9 text-red-300" />
                        </div>

                        <div className="mt-8 text-center">
                            <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                                Review Complete
                            </p>
                            <h2 className="mt-3 text-2xl font-black text-white md:text-3xl">
                                Access could not be enabled
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-white/60">
                                {content.reviewText}
                            </p>
                        </div>

                        <div className="mt-8 space-y-4">
                            {[
                                {
                                    title: "Submission reviewed",
                                    status: "Completed",
                                    done: true,
                                },
                                {
                                    title:
                                        role === "employee"
                                            ? "Employee eligibility assessment"
                                            : "Customer eligibility assessment",
                                    status: "Completed",
                                    done: true,
                                },
                                {
                                    title:
                                        role === "employee"
                                            ? "Workspace activation"
                                            : "Dashboard activation",
                                    status: "Unavailable",
                                    done: false,
                                },
                            ].map((item) => (
                                <div
                                    key={item.title}
                                    className={`flex items-center gap-4 rounded-2xl border px-4 py-4 ${
                                        item.done
                                            ? "border-red-300/20 bg-red-400/10"
                                            : "border-white/10 bg-black/20"
                                    }`}
                                >
                                    <div
                                        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                                            item.done ? "bg-red-400/15" : "bg-white/[0.03]"
                                        }`}
                                    >
                                        {item.done ? (
                                            <CheckCircle2 className="h-5 w-5 text-red-300" />
                                        ) : (
                                            <CircleAlert className="h-5 w-5 text-white/50" />
                                        )}
                                    </div>

                                    <div className="flex-1">
                                        <p className="font-semibold text-white">{item.title}</p>
                                        <p className="mt-1 text-sm text-white/50">{item.status}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5">
                            <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                                Need Help?
                            </p>
                            <p className="mt-3 text-sm leading-6 text-white/65">
                                {content.supportText}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-3">
                                <a
                                    href="mailto:support@jigzack.com"
                                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        Contact Support
                                    </span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}