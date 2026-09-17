'use client';

import Link from 'next/link';

export default function Navbar() {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-6 py-4 md:px-10">
                <div className="flex items-center justify-between gap-6">
                    <Link
                        href="/#home"
                        className="shrink-0 text-xl font-extrabold tracking-tight text-amber-500"
                    >
                        Jigzack<span className="text-amber-300">.</span>
                    </Link>

                    <nav className="hidden flex-1 items-center justify-center gap-8 md:flex lg:gap-10">
                        <Link href="/#home" className="text-white/85 transition hover:text-amber-300">
                            Home
                        </Link>
                        <Link href="/#services" className="text-white/85 transition hover:text-amber-300">
                            Our Services
                        </Link>
                        <Link href="/#about" className="text-white/85 transition hover:text-amber-300">
                            About Us
                        </Link>
                        <Link href="/#contact" className="text-white/85 transition hover:text-amber-300">
                            Contact Us
                        </Link>
                    </nav>

                    <div className="flex shrink-0 items-center gap-3">
                        <Link
                            href="/auth"
                            className="rounded-xl border border-amber-300/20 bg-white/5 px-4 py-2 font-semibold text-white transition hover:bg-white/10"
                        >
                            Log in
                        </Link>

                        <Link
                            href="/#services"
                            className="rounded-xl bg-amber-500 px-5 py-2 font-semibold text-black shadow-lg transition hover:bg-amber-300"
                        >
                            Learn more
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}