'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
    { href: '/', label: 'Home' },
    { href: '/services', label: 'Our Services' },
    { href: '/about', label: 'About Us' },
    { href: '/contact', label: 'Contact Us' },
];

export default function Navbar() {
    const [open, setOpen] = useState(false);

    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-6 py-4 md:px-10">
                <div className="flex items-center justify-between gap-6">
                    <Link
                        href="/"
                        onClick={() => setOpen(false)}
                        className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-amber-500"
                    >
                        <Image src="/images/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8" priority />
                        <span>
                            Jigzack<span className="text-amber-300">.</span>
                        </span>
                    </Link>

                    <nav className="hidden flex-1 items-center justify-center gap-8 md:flex lg:gap-10">
                        {NAV_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="text-white/85 transition hover:text-amber-300"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="hidden shrink-0 items-center md:flex">
                        <Link
                            href="/auth"
                            className="rounded-xl bg-amber-500 px-5 py-2 font-semibold text-black shadow-lg transition hover:bg-amber-300"
                        >
                            Get started
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-white transition hover:bg-white/10 md:hidden"
                    >
                        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            <div
                className={[
                    "overflow-hidden border-t border-white/10 transition-[max-height] duration-300 ease-out md:hidden",
                    open ? "max-h-96" : "max-h-0 border-t-0",
                ].join(" ")}
            >
                <nav className="flex flex-col gap-1 px-6 py-4">
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="rounded-lg px-3 py-2.5 font-medium text-white/85 transition hover:bg-white/5 hover:text-amber-300"
                        >
                            {link.label}
                        </Link>
                    ))}

                    <div className="mt-3 border-t border-white/10 pt-4">
                        <Link
                            href="/auth"
                            onClick={() => setOpen(false)}
                            className="block rounded-xl bg-amber-500 px-5 py-2.5 text-center font-semibold text-black shadow-lg transition hover:bg-amber-300"
                        >
                            Get started
                        </Link>
                    </div>
                </nav>
            </div>
        </header>
    );
}
