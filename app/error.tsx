'use client';

import { useEffect } from "react";
import Link from "next/link";

// Shown when a page fails while loading, instead of a blank screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error("Page error:", error);
    }, [error]);

    return (
        <main className="flex min-h-[70vh] items-center justify-center px-6 py-24">
            <div className="max-w-md text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Something went wrong</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">This page didn&apos;t load</h1>
                <p className="mt-3 text-white/65">
                    It&apos;s probably a temporary problem on our side. Try again, and if it keeps happening please
                    call us on 0703 433 9721.
                </p>
                {error.digest && <p className="mt-2 text-xs text-white/35">Reference: {error.digest}</p>}
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                        type="button"
                        onClick={reset}
                        className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-black transition hover:bg-amber-300"
                    >
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                    >
                        Go to home page
                    </Link>
                </div>
            </div>
        </main>
    );
}
