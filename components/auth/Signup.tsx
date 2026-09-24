'use client';

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/auth/PasswordInput";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { trackEvent } from "@/lib/analytics";

// Public signup creates customers only. An employee account can only be
// created through an admin-issued invite link (inviteToken) -- the database
// ignores any role sent from the browser, so there's no role field here.
export default function Signup({
                                   inviteToken,
                                   presetEmail,
                                   inviteKind = "employee",
                               }: {
    inviteToken?: string;
    presetEmail?: string | null;
    inviteKind?: "employee" | "admin" | "supervisor";
}) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const isEmployeeInvite = Boolean(inviteToken);

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = new FormData(e.currentTarget);
        const fullName = String(form.get("fullName") || "").trim();
        const email = String(form.get("email") || "").trim();
        const password = String(form.get("password") || "");

        const supabase = createClient();

        if (!fullName || !email || !password) {
            toast.error("Please fill in all fields");
            return;
        }

        if (password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }

        try {
            setIsLoading(true);

            const origin =
                typeof window !== "undefined" ? window.location.origin : "";

            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${origin}/auth/callback?next=/auth/complete-signup`,
                    data: {
                        full_name: fullName,
                        ...(inviteToken ? { invite_token: inviteToken } : {}),
                    },
                },
            });

            if (signUpError) {
                toast.error(signUpError.message || "Unable to create account");
                return;
            }

            // There's no session until the confirmation link is clicked, so
            // /auth/pending (which needs one) would just bounce back to the
            // login screen. This page is public and says what to do next.
            if (!isEmployeeInvite) trackEvent("sign_up", { method: "email" });
            router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
        } catch {
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <CardHeader className="px-0 pt-0 pb-4">
                <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-white">
                    {!isEmployeeInvite
                        ? "Create account"
                        : inviteKind === "employee"
                            ? "Create your employee account"
                            : inviteKind === "supervisor"
                                ? "Create your supervisor account"
                                : "Create your admin account"}
                </CardTitle>
                <CardDescription className="text-white/65">
                    {isEmployeeInvite
                        ? inviteKind === "employee"
                            ? "You've been invited to join the Jigzack team."
                            : "You've been invited to help run Jigzack. Sign up with the email address the invite was sent to."
                        : "Register as a customer to book and track waste collection."}
                </CardDescription>
            </CardHeader>

            <CardContent className="px-0 pb-0">
                <form onSubmit={handleSignup} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="fullName" className="text-white/80">
                            Full name
                        </Label>
                        <Input
                            id="fullName"
                            name="fullName"
                            type="text"
                            placeholder="Your full name"
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-white/80">
                            Email
                        </Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="example@gmail.com"
                            autoComplete="email"
                            defaultValue={presetEmail ?? ""}
                            readOnly={Boolean(presetEmail)}
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-white/80">
                            Password
                        </Label>
                        <PasswordInput
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? "Creating account..." : "Create account"}
                    </Button>

                    <p className="text-center text-xs text-white/55 leading-5">
                        We&apos;ll email you a link to confirm your address. New accounts also need admin approval before dashboard access.
                    </p>

                    <p className="text-center text-xs text-white/45 leading-5">
                        By creating an account you agree to our{" "}
                        <Link href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-amber-300">
                            Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-amber-300">
                            Privacy Policy
                        </Link>
                        .
                    </p>
                </form>
            </CardContent>
        </>
    );
}
