'use client';

import React, { useState } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import client from "@/api/client";

export default function Login() {
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = new FormData(e.currentTarget);
        const email = String(form.get("email") || "").trim();
        const password = String(form.get("password") || "");

        if (!email || !password) {
            toast.error("Please fill all fields");
            return;
        }

        try {
            setIsLoading(true);

            const { data, error } = await client.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                toast.error(error.message || "Unable to login, please try again");
                return;
            }

            toast.success("Logged in successfully!");
            return data;
        } catch {
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-xl rounded-3xl overflow-hidden">
            {/* subtle top glow */}
            <div className="h-1 w-full bg-gradient-to-r from-amber-300 via-orange-500 to-amber-200" />

            <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-black tracking-tight text-white">
                    Welcome back
                </CardTitle>
                <CardDescription className="text-white/70">
                    Enter your email and password to log in.
                </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
                <form onSubmit={handleLogin} className="space-y-5">
                    {/* Email */}
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
                            className="bg-white/10 border-white/10 text-white placeholder:text-white/40
                         focus-visible:ring-amber-300/70 focus-visible:ring-offset-0
                         rounded-xl h-11"
                        />
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-white/80">
                                Password
                            </Label>

                            {/* Optional: wire this later */}
                            <button
                                type="button"
                                className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition"
                                onClick={() => toast.message("Forgot password flow coming soon")}
                            >
                                Forgot password?
                            </button>
                        </div>

                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            className="bg-white/10 border-white/10 text-white placeholder:text-white/40
                         focus-visible:ring-amber-300/70 focus-visible:ring-offset-0
                         rounded-xl h-11"
                        />
                    </div>

                    {/* Submit */}
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-11 rounded-xl font-bold text-black
                       bg-amber-400 hover:bg-amber-300
                       disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "Logging in..." : "Login"}
                    </Button>

                    {/* Small helper */}
                    <p className="text-center text-xs text-white/60">
                        Use a valid account to continue. Need access?{" "}
                        <span className="text-amber-300 font-semibold">Sign up</span>.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}
