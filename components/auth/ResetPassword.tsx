'use client';

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/auth/PasswordInput";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

export default function ResetPassword() {
    const [isLoading, setIsLoading] = useState(false);
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const router = useRouter();

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getSession().then(({ data }) => {
            setHasSession(!!data.session);
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = new FormData(e.currentTarget);
        const password = String(form.get("password") || "");
        const confirmPassword = String(form.get("confirmPassword") || "");

        if (!password || !confirmPassword) {
            toast.error("Please fill in all fields");
            return;
        }

        if (password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }

        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        const supabase = createClient();

        try {
            setIsLoading(true);

            const { error } = await supabase.auth.updateUser({ password });

            if (error) {
                toast.error(error.message || "Unable to reset password");
                return;
            }

            toast.success("Password updated. Please log in with your new password.");
            await supabase.auth.signOut();
            router.push("/auth");
        } catch {
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (hasSession === false) {
        return (
            <div className="text-center">
                <CardHeader className="px-0 pt-0 pb-4">
                    <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-white">
                        Link expired
                    </CardTitle>
                    <CardDescription className="text-white/65">
                        This password reset link is invalid or has expired.
                    </CardDescription>
                </CardHeader>

                <Link
                    href="/auth/forgot-password"
                    className="text-sm font-semibold text-amber-300 transition hover:text-amber-200"
                >
                    Request a new link
                </Link>
            </div>
        );
    }

    return (
        <>
            <CardHeader className="px-0 pt-0 pb-4">
                <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-white">
                    Set a new password
                </CardTitle>
                <CardDescription className="text-white/65">
                    Choose a new password for your account.
                </CardDescription>
            </CardHeader>

            <CardContent className="px-0 pb-0">
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-white/80">
                            New password
                        </Label>
                        <PasswordInput
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-white/80">
                            Confirm password
                        </Label>
                        <PasswordInput
                            id="confirmPassword"
                            name="confirmPassword"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading || hasSession === null}
                        className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? "Updating..." : "Update password"}
                    </Button>
                </form>
            </CardContent>
        </>
    );
}
