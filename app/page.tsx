'use client';

import Image from "next/image";
import Link from "next/link";
import useAuth from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import About from "@/components/About";

const HERO_PHOTOS = [
    { src: "/images/field/bins-domestic.jpg", alt: "Green wheelie bins being rolled out for collection", ratio: "aspect-[3/4]", offset: "" },
    { src: "/images/field/truck-side.jpg", alt: "Jigzack Cleaning Services refuse truck", ratio: "aspect-square", offset: "mt-8" },
    { src: "/images/field/crew-rain-bin.jpg", alt: "Collection crew emptying a bin in the rain", ratio: "aspect-square", offset: "" },
    { src: "/images/field/truck-rear.jpg", alt: "Compactor truck at the loading point", ratio: "aspect-[3/4]", offset: "mt-8" },
];

const GALLERY = [
    { src: "/images/field/commercial-bins-1.jpg", alt: "Crew emptying commercial bins into the truck" },
    { src: "/images/field/roadside-2.jpg", alt: "Crew clearing roadside waste" },
    { src: "/images/field/plastics-truck.jpg", alt: "Truck loaded with bagged plastics" },
    { src: "/images/field/notice-crew.jpg", alt: "Crew member in a hi-vis vest posting a notice" },
    { src: "/images/field/estate-collection.jpg", alt: "Bin collection on an estate street" },
    { src: "/images/field/truck-rain.jpg", alt: "Collection truck working in heavy rain" },
];

export default function Home() {
    const { user, loading } = useAuth();
    const router = useRouter();

    if (loading && user) {
        router.push("/auth");
        return null;
    }

    return (
        <main>
            {/* HOME HERO */}
            <section className="relative overflow-hidden px-6 pb-16 pt-6 md:px-10 lg:pb-24 lg:pt-10">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_78%_30%,rgba(251,191,36,0.10),transparent)]" />

                <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="text-center lg:text-left">
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                            LAWMA Approved
                        </span>

                        <h1 className="mt-6 text-4xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">
                            Jigzack Cleaning Services<span className="text-amber-300">.</span>
                        </h1>

                        <p className="mt-4 text-lg font-medium text-white/80 md:text-xl">
                            Waste collection for homes and businesses in Lagos and Port Harcourt.
                        </p>

                        <div className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/60 md:text-lg lg:mx-0">
                            <About />
                        </div>

                        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                            <Link
                                href="/auth"
                                className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-black transition hover:bg-amber-300"
                            >
                                Get Started
                            </Link>
                            <Link
                                href="/services"
                                className="rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                            >
                                Our Services
                            </Link>
                        </div>
                    </div>

                    <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3 md:gap-4 lg:max-w-none">
                        {HERO_PHOTOS.map((photo) => (
                            <div
                                key={photo.src}
                                className={`relative ${photo.ratio} ${photo.offset} overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/40`}
                            >
                                <Image
                                    src={photo.src}
                                    alt={photo.alt}
                                    fill
                                    sizes="(min-width: 1024px) 22vw, 45vw"
                                    className="object-cover"
                                    priority
                                />
                            </div>
                        ))}
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

            {/* FIELD GALLERY */}
            <section className="px-6 py-16 md:px-10 md:py-20">
                <div className="mx-auto max-w-6xl">
                    <h2 className="text-3xl font-black md:text-4xl">
                        Our crews at work<span className="text-amber-300">.</span>
                    </h2>
                    <p className="mt-2 text-white/60">Photos from collections in Lagos.</p>

                    <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                        {GALLERY.map((photo) => (
                            <div
                                key={photo.src}
                                className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10"
                            >
                                <Image
                                    src={photo.src}
                                    alt={photo.alt}
                                    fill
                                    sizes="(min-width: 768px) 33vw, 50vw"
                                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
}
