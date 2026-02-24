'use client';

import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Signup from "@/components/auth/Signup";
import Login from "@/components/auth/Login";

export default function Auth() {
    const searchParams = useSearchParams();

    // Optional deep-link: /auth?mode=signup
    const defaultTab = useMemo(() => {
        const mode = searchParams.get("mode");
        return mode === "signup" ? "signup" : "login";
    }, [searchParams]);

    // controlled tabs (needed for sliding pill)
    const [tab, setTab] = useState<string>(defaultTab);

    // if query changes, reflect it
    useEffect(() => {
        setTab(defaultTab);
    }, [defaultTab]);

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-6 text-center">
                <p className="text-white/80 text-sm font-semibold tracking-wide uppercase">
                    Welcome to
                </p>
                <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-white">
                    Jigzack<span className="text-amber-300">.</span>
                </h1>
                <p className="mt-2 text-white/70 text-sm md:text-base">
                    Secure access for homes & businesses — quick, simple, reliable.
                </p>
            </div>

            {/* Glass card */}
            <div className="relative rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-2xl">
                {/* soft glow */}
                <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-300/20 via-orange-500/10 to-transparent blur-2xl" />

                <div className="relative p-5 md:p-6">
                    <Tabs value={tab} onValueChange={setTab} className="w-full">
                        <TabsList className="relative grid w-full grid-cols-2 bg-white/10 border border-white/10 rounded-2xl p-1 overflow-hidden">
                            {/* Sliding pill background */}
                            <div
                                className={[
                                    "absolute top-1 left-1",
                                    "h-[calc(100%-0.5rem)] w-[calc(50%-0.25rem)]",
                                    "rounded-xl bg-amber-400 shadow-md",
                                    "transition-transform duration-300 ease-out",
                                    tab === "signup" ? "translate-x-full" : "translate-x-0",
                                ].join(" ")}
                            />

                            <TabsTrigger
                                value="login"
                                className="relative z-10 rounded-xl font-semibold bg-transparent text-white/80 data-[state=active]:text-black"
                            >
                                Login
                            </TabsTrigger>

                            <TabsTrigger
                                value="signup"
                                className="relative z-10 rounded-xl font-semibold bg-transparent text-white/80 data-[state=active]:text-black"
                            >
                                Signup
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="login" className="mt-5 outline-none">
                            <div className="animate-[fadeIn_.25s_ease-out]">
                                <Login />
                            </div>
                        </TabsContent>

                        <TabsContent value="signup" className="mt-5 outline-none">
                            <div className="animate-[fadeIn_.25s_ease-out]">
                                <Signup />
                            </div>
                        </TabsContent>
                    </Tabs>

                    {/* Footer helper */}
                    <div className="mt-6 text-center text-xs text-white/60">
                        By continuing, you agree to our{" "}
                        <span className="text-amber-300 font-semibold">Terms</span> &{" "}
                        <span className="text-amber-300 font-semibold">Privacy Policy</span>.
                    </div>
                </div>
            </div>
        </div>
    );
}
