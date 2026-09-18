'use client';

import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Signup from "@/components/auth/Signup";
import Login from "@/components/auth/Login";

export default function Auth() {
    const searchParams = useSearchParams();

    const defaultTab = useMemo(() => {
        const mode = searchParams.get("mode");
        return mode === "signup" ? "signup" : "login";
    }, [searchParams]);

    const [tab, setTab] = useState<string>(defaultTab);

    useEffect(() => {
        setTab(defaultTab);
    }, [defaultTab]);

    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="px-5 py-6 md:px-7 md:py-8">
                <div className="mb-6 text-center">
                    <p className="text-white/70 text-xs md:text-sm font-semibold tracking-[0.25em] uppercase">
                        Welcome to
                    </p>

                    <h1 className="mt-2 text-3xl md:text-5xl font-black tracking-tight text-white">
                        Jigzack<span className="text-amber-300">.</span>
                    </h1>

                    <p className="mt-3 text-sm md:text-base text-white/65 max-w-md mx-auto leading-6">
                        Secure access for customers, employees, and administrators.
                    </p>
                </div>

                <Tabs value={tab} onValueChange={setTab} className="w-full">
                    <TabsList className="relative grid w-full grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1 overflow-hidden">
                        <div
                            className={[
                                "absolute top-1 left-1 h-[calc(100%-0.5rem)] w-[calc(50%-0.25rem)]",
                                "rounded-xl bg-amber-400 shadow-lg",
                                "transition-transform duration-300 ease-out",
                                tab === "signup" ? "translate-x-full" : "translate-x-0",
                            ].join(" ")}
                        />

                        <TabsTrigger
                            value="login"
                            className="relative z-10 rounded-xl bg-transparent font-semibold text-white/80 data-[state=active]:text-black"
                        >
                            Login
                        </TabsTrigger>

                        <TabsTrigger
                            value="signup"
                            className="relative z-10 rounded-xl bg-transparent font-semibold text-white/80 data-[state=active]:text-black"
                        >
                            Signup
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="login" className="mt-6">
                        <div className="animate-[fadeIn_.25s_ease-out]">
                            <Login />
                        </div>
                    </TabsContent>

                    <TabsContent value="signup" className="mt-6">
                        <div className="animate-[fadeIn_.25s_ease-out]">
                            <Signup />
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="mt-6 text-center text-xs text-white/55 leading-5">
                    By continuing, you agree to our{" "}
                    <span className="font-semibold text-amber-300">Terms</span> and{" "}
                    <span className="font-semibold text-amber-300">Privacy Policy</span>.
                </div>
            </div>
        </section>
    );
}