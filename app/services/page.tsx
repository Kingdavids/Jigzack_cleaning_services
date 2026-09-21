import { Home as HomeIcon, Building2, Recycle } from "lucide-react";

export default function ServicesPage() {
    return (
        <main>
            <section className="relative px-6 md:px-10 py-20 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-25 animate-serviceBg"
                    style={{
                        backgroundImage: "url('/images/sevice-bg.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="absolute inset-0 bg-slate-950/70" />

                <div className="relative max-w-6xl mx-auto text-white">
                    <h2 className="text-3xl md:text-4xl font-black">
                        Our Services<span className="text-amber-300">.</span>
                    </h2>
                    <p className="mt-3 text-white/75 max-w-2xl">
                        Efficient, reliable, and environmentally friendly waste solutions for homes and businesses.
                    </p>

                    <div className="mt-10 grid gap-6 md:grid-cols-3">
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
        </main>
    );
}
