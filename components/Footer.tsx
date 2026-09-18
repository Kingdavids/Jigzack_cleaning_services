import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function Footer() {
    return (
        <footer className="border-t border-white/10 bg-[#06060a]">
            <div className="mx-auto max-w-7xl px-6 py-14 md:px-10">
                <div className="grid gap-10 md:grid-cols-[1.3fr_0.7fr_0.7fr_1fr]">
                    <div>
                        <Link href="/#home" className="text-xl font-extrabold tracking-tight text-amber-500">
                            Jigzack<span className="text-amber-300">.</span>
                        </Link>
                        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
                            Government-approved solid waste disposal for homes and businesses across Lagos and Port Harcourt.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            LAWMA Approved
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Explore</p>
                        <div className="mt-4 flex flex-col gap-3 text-sm">
                            <Link href="/#home" className="text-white/65 transition hover:text-amber-300">Home</Link>
                            <Link href="/#services" className="text-white/65 transition hover:text-amber-300">Our Services</Link>
                            <Link href="/#about" className="text-white/65 transition hover:text-amber-300">About Us</Link>
                            <Link href="/#contact" className="text-white/65 transition hover:text-amber-300">Contact Us</Link>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Account</p>
                        <div className="mt-4 flex flex-col gap-3 text-sm">
                            <Link href="/auth" className="text-white/65 transition hover:text-amber-300">Log in</Link>
                            <Link href="/auth?mode=signup" className="text-white/65 transition hover:text-amber-300">Create account</Link>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Contact</p>
                        <div className="mt-4 flex flex-col gap-2 text-sm text-white/65">
                            <a href="mailto:info@jigzack.com" className="transition hover:text-amber-300">info@jigzack.com</a>
                            <a href="tel:+2340000000000" className="transition hover:text-amber-300">+234 (000) 000 0000</a>
                            <p className="text-white/45">Lagos • Port Harcourt</p>
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
                    <p>&copy; {new Date().getFullYear()} Jigzack Cleaning Services. All rights reserved.</p>
                    <p>Lagos State Waste Management Authority (LAWMA) approved operator.</p>
                </div>
            </div>
        </footer>
    );
}
