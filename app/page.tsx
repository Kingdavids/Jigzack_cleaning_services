'use client';

import Link from "next/link";
import useAuth from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import About from "@/components/About";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Home as HomeIcon, Building2, Recycle } from "lucide-react";

export default function Home() {
    const { user, loading } = useAuth();
    const router = useRouter();

    if (loading && user) {
        router.push("/auth");
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-950">
            <Navbar />
            <main className="pt-28">
            {/* HOME HERO – FULL WIDTH */}
            <section id="home" className="relative min-h-screen w-full overflow-hidden scroll-mt-28">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: "url('/images/fleet-truck-street.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/75 to-slate-950" />

                <div className="relative z-10 min-h-screen w-full flex items-center justify-center px-6 md:px-10">
                    <div className="max-w-2xl w-full text-center">
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                            LAWMA Approved
                        </span>

                        <h1 className="mt-6 text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white">
                            Jigzack Cleaning Services<span className="text-amber-300">.</span>
                        </h1>

                        <p className="mt-4 text-lg md:text-xl text-white/80 font-medium">
                            Smart Waste Solutions for a Cleaner, Greener Tomorrow.
                        </p>

                        <div className="mt-4 text-base md:text-lg text-white/60 leading-relaxed max-w-xl mx-auto">
                            <About />
                        </div>

                        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                            <Link
                                href="/auth"
                                className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-black transition hover:bg-amber-300"
                            >
                                Get Started
                            </Link>
                            <Link
                                href="/#services"
                                className="rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                            >
                                Our Services
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* TRUST / STATS STRIP */}
            <section className="border-y border-white/10 bg-[#06060a] px-6 py-10 md:px-10">
                <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 text-center md:grid-cols-4">
                    {[
                        { value: "LAWMA", label: "Approved operator" },
                        { value: "2,450+", label: "Domestic facilities serviced" },
                        { value: "680+", label: "Commercial facilities serviced" },
                        { value: "2 Cities", label: "Lagos & Port Harcourt" },
                    ].map((stat) => (
                        <div key={stat.label}>
                            <p className="text-2xl font-black text-amber-300 md:text-3xl">{stat.value}</p>
                            <p className="mt-1 text-xs text-white/50 md:text-sm">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* OUR SERVICES SECTION */}
            <section id="services" className="relative scroll-mt-28 px-6 md:px-10 py-20 overflow-hidden">
                {/* Animated service-bg image */}
                <div
                    className="absolute inset-0 opacity-25 animate-serviceBg"
                    style={{
                        backgroundImage: "url('/images/sevice-bg.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                {/* soft dark overlay to keep readability */}
                <div className="absolute inset-0 bg-slate-950/70" />

                <div className="relative max-w-6xl mx-auto text-white">
                    <h2 className="text-3xl md:text-4xl font-black">
                        Our Services<span className="text-amber-300">.</span>
                    </h2>
                    <p className="mt-3 text-white/75 max-w-2xl">
                        Efficient, reliable, and environmentally friendly waste solutions for homes and businesses.
                    </p>

                    {/* Service cards */}
                    <div className="mt-10 grid gap-6 md:grid-cols-3">
                        {/* Domestic */}
                        <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 transition-all duration-300 hover:bg-white/10 hover:border-amber-300/30 animate-riseIn">
                            <div className="relative overflow-hidden rounded-xl border border-white/10">
                                <img
                                    src="/images/domestic-waste.jpg"
                                    alt="Domestic waste collection"
                                    className="h-40 w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                                <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-black">
                                    <HomeIcon className="h-4 w-4" />
                                </div>
                            </div>

                            <h3 className="mt-5 text-xl font-bold">
                                Domestic Collection
                            </h3>

                            <p className="mt-2 text-white/75 leading-relaxed">
                                We take the stress out of household waste. With consistent pickups and a clean, respectful approach,
                                your home stays fresh, your bins stay under control, and your neighborhood stays proud.
                            </p>

                            <div className="mt-4 text-sm font-semibold text-amber-300/90 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                Reliable pickups • Cleaner surroundings
                            </div>
                        </div>

                        {/* Commercial */}
                        <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 transition-all duration-300 hover:bg-white/10 hover:border-amber-300/30 animate-riseIn [animation-delay:120ms]">
                            <div className="relative overflow-hidden rounded-xl border border-white/10">
                                <img
                                    src="/images/fleet-truck-front.jpg"
                                    alt="Commercial waste disposal"
                                    className="h-40 w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                                <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-black">
                                    <Building2 className="h-4 w-4" />
                                </div>
                            </div>

                            <h3 className="mt-5 text-xl font-bold">
                                Commercial Disposal
                            </h3>

                            <p className="mt-2 text-white/75 leading-relaxed">
                                Your business runs better when waste isn’t in the way. We deliver on-time collection that keeps your
                                premises clean, your staff comfortable, and your operations compliant — without disrupting your day.
                            </p>

                            <div className="mt-4 text-sm font-semibold text-amber-300/90 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                On-time service • Business-ready cleanliness
                            </div>
                        </div>

                        {/* Eco-friendly */}
                        <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 transition-all duration-300 hover:bg-white/10 hover:border-amber-300/30 animate-riseIn [animation-delay:240ms]">
                            <div className="relative overflow-hidden rounded-xl border border-white/10">
                                <img
                                    src="/images/plastic-waste.jpg"
                                    alt="Eco-friendly waste handling and plastics"
                                    className="h-40 w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                                <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-black">
                                    <Recycle className="h-4 w-4" />
                                </div>
                            </div>

                            <h3 className="mt-5 text-xl font-bold">
                                Eco-Friendly Handling
                            </h3>

                            <p className="mt-2 text-white/75 leading-relaxed">
                                We don’t just move waste — we handle it responsibly. From plastics to general refuse, we follow
                                safer disposal practices that reduce environmental impact and help keep our communities greener.
                            </p>

                            <div className="mt-4 text-sm font-semibold text-amber-300/90 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                Responsible disposal • Greener future
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ABOUT US SECTION */}
            <section id="about" className="relative scroll-mt-28 px-6 md:px-10 py-24 overflow-hidden">
                {/* Animated BG: team-6 */}
                <div
                    className="absolute inset-0 opacity-30 animate-teamBg"
                    style={{
                        backgroundImage: "url('/images/team-6.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="absolute inset-0 bg-slate-950/70" />

                <div className="relative max-w-6xl mx-auto text-white">
                    <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                        {/* Left: Story */}
                        <div className="animate-riseIn">
                            <h2 className="text-3xl md:text-4xl font-black">
                                About Us<span className="text-amber-300">.</span>
                            </h2>

                            <p className="mt-5 text-white/80 leading-relaxed text-base md:text-lg">
                                Jigzack Cleaning Services is a government-approved solid waste disposal company built on one simple belief:
                                clean environments create better lives. We are proudly recognized under Lagos State waste management
                                regulation through LAWMA (Lagos Waste Management Authority) approval — a standard that shapes how we collect,
                                transport, and dispose waste with responsibility, safety, and consistency.
                            </p>

                            <p className="mt-4 text-white/80 leading-relaxed text-base md:text-lg">
                                From residential streets to busy commercial hubs, we operate actively across <span className="text-amber-300 font-semibold">Lagos</span> and
                                <span className="text-amber-300 font-semibold"> Port Harcourt</span>, Nigeria — delivering scheduled pickups, dependable service, and
                                clean handling that keeps homes comfortable and businesses compliant. Whether it’s a single household bin
                                or a high-traffic facility, our process is designed to be smooth, punctual, and respectful to your space.
                            </p>

                            <p className="mt-4 text-white/80 leading-relaxed text-base md:text-lg">
                                Beyond collection, Jigzack is committed to long-term change. We also support waste education and awareness
                                initiatives — teaching communities and organizations around the nation practical waste management habits,
                                smarter disposal methods, and eco-conscious practices that reduce pollution and protect public health.
                                For us, it’s not just waste removal — it’s community care, environmental responsibility, and building a
                                cleaner tomorrow that everyone can be proud of.
                            </p>

                            {/* Stats (edit numbers here) */}
                            <div className="mt-8 grid grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Domestic facilities serviced</p>
                                    <p className="mt-2 text-3xl font-black text-amber-300">2,450+</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Commercial facilities serviced</p>
                                    <p className="mt-2 text-3xl font-black text-amber-300">680+</p>
                                </div>
                            </div>
                        </div>

                        {/* Right: Team slider + testimonials */}
                        <div className="space-y-6">
                            {/* Team slider */}
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6 animate-riseIn [animation-delay:120ms]">
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <h3 className="text-xl md:text-2xl font-black">
                                            The Team<span className="text-amber-300">.</span>
                                        </h3>
                                        <p className="mt-1 text-white/70 text-sm">
                                            A dedicated crew trained for safety, speed, and clean handling.
                                        </p>
                                    </div>
                                    <div className="text-xs text-white/60 hidden sm:block">
                                        Swipe / scroll →
                                    </div>
                                </div>

                                <div className="mt-5 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                                    {[
                                        { name: "Operations Lead", img: "/images/team-1.jpg" },
                                        { name: "Field Supervisor", img: "/images/team-2.jpg" },
                                        { name: "Collection Team", img: "/images/team-3.jpg" },
                                        { name: "Community Outreach", img: "/images/team-4.jpg" },
                                        { name: "Commercial Support", img: "/images/team-5.jpg" },
                                    ].map((m, i) => (
                                        <div
                                            key={i}
                                            className="min-w-[240px] snap-start group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden hover:bg-white/10 transition"
                                        >
                                            <div className="relative h-40 overflow-hidden">
                                                <img
                                                    src={m.img}
                                                    alt={m.name}
                                                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                    loading="lazy"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                                            </div>
                                            <div className="p-4">
                                                <p className="font-bold text-white">{m.name}</p>
                                                <p className="text-sm text-white/70 mt-1">
                                                    Trained. Reliable. Service-first.
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Testimonials slider */}
                            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6 animate-riseIn [animation-delay:240ms]">
                                <h3 className="text-xl md:text-2xl font-black">
                                    Testimonials<span className="text-amber-300">.</span>
                                </h3>
                                <p className="mt-1 text-white/70 text-sm">
                                    What clients say about our service.
                                </p>

                                <div className="mt-5 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                                    {[
                                        {
                                            quote:
                                                "Jigzack is consistent. Pickups are always on time, and our environment stays clean. The team is polite and professional.",
                                            name: "Residential Client (Lagos)",
                                        },
                                        {
                                            quote:
                                                "As a commercial facility, compliance matters. Jigzack made it easy — reliable collection, no delays, no mess.",
                                            name: "Facility Manager (Port Harcourt)",
                                        },
                                        {
                                            quote:
                                                "Their waste education sessions opened our eyes. We improved our disposal habits, and it shows in our community hygiene.",
                                            name: "Community Coordinator (Nigeria)",
                                        },
                                    ].map((t, i) => (
                                        <div
                                            key={i}
                                            className="min-w-[280px] snap-start rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/10 transition"
                                        >
                                            <p className="text-white/80 leading-relaxed">“{t.quote}”</p>
                                            <p className="mt-4 text-sm font-bold text-amber-300">{t.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CONTACT US SECTION */}
            <section id="contact" className="relative scroll-mt-28 px-6 md:px-10 py-24 overflow-hidden">
                {/* Animated contact background */}
                <div
                    className="absolute inset-0 opacity-35 animate-contactBg"
                    style={{
                        backgroundImage: "url('/images/contact.jpeg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="absolute inset-0 bg-slate-950/75" />

                <div className="relative max-w-6xl mx-auto text-white">
                    <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                        {/* Left: Text */}
                        <div className="animate-riseIn">
                            <h2 className="text-3xl md:text-4xl font-black">
                                Contact Us<span className="text-amber-300">.</span>
                            </h2>

                            <p className="mt-4 text-white/75 text-base md:text-lg leading-relaxed max-w-xl">
                                Need a pickup plan for your home or business? Want a quote for monthly service, or a waste management
                                awareness session in your community? Reach out — we respond fast and we treat every request with care.
                            </p>

                            <div className="mt-8 grid gap-4">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Email</p>
                                    <p className="mt-1 text-lg font-bold text-amber-300">info@jigzack.com</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Phone</p>
                                    <p className="mt-1 text-lg font-bold text-amber-300">+234 (000) 000 0000</p>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Operating cities</p>
                                    <p className="mt-1 text-white/85 font-semibold">
                                        Lagos • Port Harcourt • Nationwide outreach programs
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Right: mini “contact card” */}
                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8 animate-riseIn [animation-delay:160ms]">
                            <h3 className="text-2xl font-black">
                                Let’s schedule your service<span className="text-amber-300">.</span>
                            </h3>
                            <p className="mt-2 text-white/70">
                                Tell us what you need — domestic pickup, commercial service, or eco-handling support.
                            </p>

                            <div className="mt-6 grid gap-4">
                                <a
                                    href="mailto:info@jigzack.com"
                                    className="rounded-2xl bg-amber-400 text-black font-bold px-5 py-3 text-center hover:bg-amber-300 transition shadow-lg"
                                >
                                    Email Us
                                </a>

                                <a
                                    href="tel:+2340000000000"
                                    className="rounded-2xl border border-white/15 bg-white/10 text-white font-bold px-5 py-3 text-center hover:bg-white/15 transition"
                                >
                                    Call Now
                                </a>

                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                                    Fast response • Flexible plans • Competitive monthly rates
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
    </main>
            <Footer />
        </div>
    );
}
