'use client';

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/auth/PasswordInput";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

type AppRole = "admin" | "employee" | "customer";
type ProfileStatus = "pending" | "approved" | "declined";

export default function Login() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = new FormData(e.currentTarget);
        const email = String(form.get("email") || "").trim();
        const password = String(form.get("password") || "");

        if (!email || !password) {
            toast.error("Please fill in all fields");
            return;
        }

        const supabase = createClient();

        try {
            setIsLoading(true);

            const { error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (loginError) {
                toast.error(loginError.message || "Unable to login, please try again");
                return;
            }

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                toast.error("Login succeeded, but user details could not be loaded.");
                return;
            }

            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("role, status, full_name")
                .eq("id", user.id)
                .single();

            if (profileError || !profile) {
                toast.error("Profile not found for this account.");
                return;
            }

            const role = profile.role as AppRole;
            const status = profile.status as ProfileStatus;

            if (status === "pending") {
                toast.message("Your account is still pending approval.");
                router.refresh();
                router.push("/auth/pending");
                return;
            }

            if (status === "declined") {
                toast.error("Your account access has been declined.");
                router.refresh();
                router.push("/auth/decline");
                return;
            }

            toast.success(`Welcome back${profile.full_name ? `, ${profile.full_name}` : ""}!`);

            // Only follow a `next` that stays on this user's own dashboard.
            const next = searchParams.get("next");
            const home = `/${role === "admin" || role === "employee" ? role : "customer"}`;
            const target =
                next && !next.startsWith("//") && (next === home || next.startsWith(`${home}/`)) ? next : home;

            router.refresh();
            router.push(target);
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
                    Welcome back
                </CardTitle>
                <CardDescription className="text-white/65">
                    Sign in to continue to your dashboard.
                </CardDescription>
            </CardHeader>

            <CardContent className="px-0 pb-0">
                <form onSubmit={handleLogin} className="space-y-5">
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

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-white/80">
                                Password
                            </Label>

                            <Link
                                href="/auth/forgot-password"
                                className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition"
                            >
                                Forgot password?
                            </Link>
                        </div>

                        <PasswordInput
                            id="password"
                            name="password"
                            autoComplete="current-password"
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? "Logging in..." : "Login"}
                    </Button>

                    <p className="text-center text-xs text-white/55 leading-5">
                        Use the email and password linked to your approved account.
                    </p>
                </form>
            </CardContent>
        </>
    );
}