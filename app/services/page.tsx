import { Home as HomeIcon, Building2, Recycle } from "lucide-react";

export default function ServicesPage() {
    return (
        <main>
            <section className="relative px-6 md:px-10 py-20 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-25 animate-serviceBg"
                    style={{
                        backgroundImage: "url('/images/field/roadside-2.jpg')",
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
                        Waste collection for homes and businesses.
                    </p>

                    <div className="mt-10 grid gap-6 md:grid-cols-3">
                        <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 transition-all duration-300 hover:bg-white/10 hover:border-amber-300/30 animate-riseIn">
                            <div className="relative overflow-hidden rounded-xl border border-white/10">
                                <img
                                    src="/images/field/bins-domestic.jpg"
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
                                Household waste collected on a regular schedule, so your bins don&apos;t pile up and your street stays clean.
                            </p>

                            <div className="mt-4 text-sm font-semibold text-amber-300/90 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                Weekly, bi-weekly, monthly or custom schedules
                            </div>
                        </div>

                        <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 transition-all duration-300 hover:bg-white/10 hover:border-amber-300/30 animate-riseIn [animation-delay:120ms]">
                            <div className="relative overflow-hidden rounded-xl border border-white/10">
                                <img
                                    src="/images/field/commercial-bins-2.jpg"
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
                                Collection for shops, supermarkets, hotels, schools, eateries and other business premises, on a set schedule.
                            </p>

                            <div className="mt-4 text-sm font-semibold text-amber-300/90 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                Rates set by property type
                            </div>
                        </div>

                        <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 transition-all duration-300 hover:bg-white/10 hover:border-amber-300/30 animate-riseIn [animation-delay:240ms]">
                            <div className="relative overflow-hidden rounded-xl border border-white/10">
                                <img
                                    src="/images/field/plastics-truck-2.jpg"
                                    alt="Truck loaded with bagged plastics"
                                    className="h-40 w-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                                <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-black">
                                    <Recycle className="h-4 w-4" />
                                </div>
                            </div>

                            <h3 className="mt-5 text-xl font-bold">
                                Plastics and general refuse
                            </h3>

                            <p className="mt-2 text-white/75 leading-relaxed">
                                We collect bagged plastics as well as general refuse, and dispose of both using safer disposal practices.
                            </p>

                            <div className="mt-4 text-sm font-semibold text-amber-300/90 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                Bagged plastics and general refuse
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
