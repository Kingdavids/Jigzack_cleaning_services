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

export default function Signup() {
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const cleanEmail = email.trim();
        const cleanPhone = phone.trim();

        if (!cleanEmail || !cleanPhone || !password) {
            toast.error("Please fill all fields");
            return;
        }

        try {
            setIsLoading(true);

            const { data, error } = await client.auth.signUp({
                email: cleanEmail,
                password,
                options: {
                    data: { phone: cleanPhone },
                },
            });

            if (error) {
                toast.error(error.message || "Unable to create account, please try again");
                return;
            }

            toast.success("Account created successfully!");
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
                    Create your account
                </CardTitle>
                <CardDescription className="text-white/70">
                    Get started in a minute — simple, secure, reliable.
                </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
                <form onSubmit={handleSignup} className="space-y-5">
                    {/* Email */}
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-white/80">
                            Email
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="example@gmail.com"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-white/10 border-white/10 text-white placeholder:text-white/40
                         focus-visible:ring-amber-300/70 focus-visible:ring-offset-0
                         rounded-xl h-11"
                        />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <Label htmlFor="phone" className="text-white/80">
                            Phone Number
                        </Label>
                        <Input
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            placeholder="08012345678"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="bg-white/10 border-white/10 text-white placeholder:text-white/40
                         focus-visible:ring-amber-300/70 focus-visible:ring-offset-0
                         rounded-xl h-11"
                        />
                        <p className="text-xs text-white/55">
                            We’ll only use this for account/security updates.
                        </p>
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-white/80">
                                Password
                            </Label>

                            <button
                                type="button"
                                onClick={() => setShowPassword((s) => !s)}
                                className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition"
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>

                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-white/10 border-white/10 text-white placeholder:text-white/40
                         focus-visible:ring-amber-300/70 focus-visible:ring-offset-0
                         rounded-xl h-11"
                        />

                        <p className="text-xs text-white/55">
                            Use at least 8 characters for a stronger password.
                        </p>
                    </div>

                    {/* Submit */}
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-11 rounded-xl font-bold text-black
                       bg-amber-400 hover:bg-amber-300
                       disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "Creating account..." : "Create account"}
                    </Button>

                    <p className="text-center text-xs text-white/60">
                        By creating an account, you agree to our{" "}
                        <span className="text-amber-300 font-semibold">Terms</span> &{" "}
                        <span className="text-amber-300 font-semibold">Privacy Policy</span>.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}
