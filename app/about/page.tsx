import Image from "next/image";

const LEADERS = [
    { name: "Samuel John", role: "Operations Lead", img: "/images/team/samuel-john.jpg" },
    { name: "Bikun Ishaku Bello", role: "Field Coordinator", img: "/images/team/bikun.jpg" },
];

const CREW = [
    { caption: "Collection crew", img: "/images/field/crew-rain-bin.jpg" },
    { caption: "Field team", img: "/images/field/notice-crew.jpg" },
    { caption: "Our trucks", img: "/images/field/truck-rain.jpg" },
];

export default function AboutPage() {
    return (
        <main>
            <section className="relative px-6 md:px-10 py-24 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-30 animate-teamBg"
                    style={{
                        backgroundImage: "url('/images/field/truck-side.jpg')",
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
                                Jigzack Cleaning Services is a solid waste disposal company approved by the Lagos Waste Management Authority (LAWMA). That approval sets the standard we follow when we collect, transport and dispose of waste.
                            </p>

                            <p className="mt-4 text-white/80 leading-relaxed text-base md:text-lg">
                                We collect from homes and commercial facilities in <span className="text-amber-300 font-semibold">Lagos</span> and <span className="text-amber-300 font-semibold">Port Harcourt</span>, from a single household bin to busy commercial sites. Pickups are scheduled in advance, so you know when we&apos;re coming.
                            </p>

                            <p className="mt-4 text-white/80 leading-relaxed text-base md:text-lg">
                                We also run waste education and awareness sessions. We teach communities and organizations across Nigeria practical waste management habits and better ways to dispose of waste, to cut pollution and protect public health.
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
                                <h3 className="text-xl md:text-2xl font-black">
                                    The Team<span className="text-amber-300">.</span>
                                </h3>
                                <p className="mt-1 text-white/70 text-sm">
                                    The people who run operations, and the crews on the ground.
                                </p>

                                <div className="mt-5 grid grid-cols-2 gap-4">
                                    {LEADERS.map((person) => (
                                        <div
                                            key={person.name}
                                            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                                        >
                                            <div className="relative aspect-[4/5] overflow-hidden">
                                                <Image
                                                    src={person.img}
                                                    alt={`${person.name}, ${person.role}`}
                                                    fill
                                                    sizes="(min-width: 1024px) 22vw, 45vw"
                                                    className="object-cover object-top"
                                                />
                                            </div>
                                            <div className="p-4">
                                                <p className="font-bold text-white">{person.name}</p>
                                                <p className="mt-0.5 text-sm text-amber-300">{person.role}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-3">
                                    {CREW.map((crew) => (
                                        <div key={crew.caption} className="overflow-hidden rounded-xl border border-white/10">
                                            <div className="relative aspect-square">
                                                <Image
                                                    src={crew.img}
                                                    alt={crew.caption}
                                                    fill
                                                    sizes="(min-width: 1024px) 12vw, 30vw"
                                                    className="object-cover"
                                                />
                                            </div>
                                            <p className="px-2 py-1.5 text-center text-xs text-white/70">{crew.caption}</p>
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
                                                "As a commercial facility, compliance matters. Jigzack made it easy, with reliable collection, no delays and no mess.",
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
