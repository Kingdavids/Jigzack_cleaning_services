'use client'

import Link from 'next/link'
import { usePathname } from "next/navigation";

const links = [
    { href: '/#home', label: 'Home'},
    { href: '/#services', label: 'Services'},
    { href: '/#about', label: 'About'},
    { href: '/#contact', label: 'Contact'},
];

export default function Navbar() {
    const pathname = usePathname();

    return (
        <header className="fixed top-0 left-0 right-0 z-50">
            <div className="max-w-7xl max-auto px-6 md:px-10 py-6">
                <div className="flex items-center justify-between ">

                    <Link
                        href="/#home"
                    className="text-amber-500 font-extrabold tarcking-tight text-xl "
                    >
                        Jigzack<span className="text-amber-300">.</span>
                    </Link>

                <nav className="hidden md:flex items-center gap-10 text-sm font-semibold text-white/900">
                    <Link href="/#home" className="hover:text-amber-300 transition">
                        Home
                    </Link>
                    <Link href="/#services" className="hover:text-amber-300 transition">
                        Our Services
                    </Link>
                    <Link href="/#about" className="hover:text-amber-300 transition">
                        About Us
                    </Link>
                    <Link href="/#contact" className="hover:text-amber-300 transition">
                        Contact Us
                    </Link>
                </nav>


                    <div className="flex items-center gap-4">
                        {/* NAVBAR BUTTONS*/}
                        <Link
                            href="/auth"
                             className="px-4 py-2 rounded-md bg-amber-500 text-white/90 font-semibold hover:text-white transition">
                                Log in
                            </Link>


                        <Link
                            href="/#services"
                            className="px-5 py-2 rounded-full bg-amber-400 text-black font-semibold hover:bg-amber-300 transition shadow-lg">
                            Learn more
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}