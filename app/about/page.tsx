export default function AboutPage() {
    return (
        <main>
            <section className="relative px-6 md:px-10 py-24 overflow-hidden">
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
                        <div className="min-w-0 animate-riseIn">
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

                        <div className="min-w-0 space-y-6">
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
        </main>
    );
}
