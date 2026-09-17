'use client';

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

type SignupRole = "customer" | "employee";

export default function Signup() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = new FormData(e.currentTarget);
        const fullName = String(form.get("fullName") || "").trim();
        const email = String(form.get("email") || "").trim();
        const password = String(form.get("password") || "");
        const role = String(form.get("role") || "customer") as SignupRole;

        const supabase = createClient();

        if (!fullName || !email || !password || !role) {
            toast.error("Please fill in all fields");
            return;
        }

        if (password.length < 6) {
            toast.error("Password must be at least 6 characters");
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
                        role,
                    },
                },
            });

            if (signUpError) {
                toast.error(signUpError.message || "Unable to create account");
                return;
            }

            toast.success("Account created successfully. Please verify your email to continue.");

            if (role === "customer") {
                router.push("/auth/customer-setup");
                return;
            }

            router.push("/auth/pending?role=employee");
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
                    Create account
                </CardTitle>
                <CardDescription className="text-white/65">
                    Register as a customer or employee.
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
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-white/80">
                            Password
                        </Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/35 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="role" className="text-white/80">
                            Account type
                        </Label>
                        <select
                            id="role"
                            name="role"
                            defaultValue="customer"
                            className="h-12 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-white outline-none"
                        >
                            <option value="customer" className="bg-slate-900">
                                Customer
                            </option>
                            <option value="employee" className="bg-slate-900">
                                Employee
                            </option>
                        </select>
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="h-12 w-full rounded-xl bg-amber-400 font-bold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isLoading ? "Creating account..." : "Create account"}
                    </Button>

                    <p className="text-center text-xs text-white/55 leading-5">
                        New accounts require email verification and admin approval before dashboard access.
                    </p>
                </form>
            </CardContent>
        </>
    );
}