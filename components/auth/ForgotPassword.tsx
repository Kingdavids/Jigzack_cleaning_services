'use client';

import React, { useState } from "react";
import Link from "next/link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPassword() {
    const [isLoading, setIsLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = new FormData(e.currentTarget);
        const email = String(form.get("email") || "").trim();

        if (!email) {
            toast.error("Please enter your email address");
            return;
        }

        const supabase = createClient();
        const origin = typeof window !== "undefined" ? window.location.origin : "";

        try {
            setIsLoading(true);

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
            });

            if (error) {
                toast.error(error.message || "Unable to send reset link");
                return;
            }

            setSent(true);
        } catch {
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (sent) {
        return (
            <div className="text-center">
                <CardHeader className="px-0 pt-0 pb-4">
                    <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-white">
                        Check your email
                    </CardTitle>
                    <CardDescription className="text-white/65">
                        If an account exists for that email, we&apos;ve sent a link to reset your password.
                    </CardDescription>
                </CardHeader>

                <Link
                    href="/auth"
                    className="text-sm font-semibold text-amber-300 transition hover:text-amber-200"
                >
                    Back to login
                </Link>
            </div>
        );
    }

    return (
        <>
            <CardHeader className="px-0 pt-0 pb-4">
                <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-white">
                    Reset your password
                </CardTitle>
                <CardDescription className="text-white/65">
                    Enter your email and we&apos;ll send you a link to reset your password.
                </CardDescription>
            </CardHeader>

            <CardContent className="px-0 pb-0">
                <form onSubmit={handleSubmit} className="space-y-5">
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
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? "Sending..." : "Send reset link"}
                    </Button>

                    <p className="text-center text-xs text-white/55 leading-5">
                        <Link href="/auth" className="font-semibold text-amber-300 transition hover:text-amber-200">
                            Back to login
                        </Link>
                    </p>
                </form>
            </CardContent>
        </>
    );
}
