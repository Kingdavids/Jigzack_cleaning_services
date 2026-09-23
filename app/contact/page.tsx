import ContactForm from "@/components/ContactForm";

export default function ContactPage() {
    return (
        <main>
            <section className="relative px-6 md:px-10 py-24 overflow-hidden">
                <div
                    className="absolute inset-0 opacity-35 animate-contactBg"
                    style={{
                        backgroundImage: "url('/images/field/truck-side.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                <div className="absolute inset-0 bg-slate-950/75" />

                <div className="relative max-w-6xl mx-auto text-white">
                    <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                        <div className="animate-riseIn">
                            <h2 className="text-3xl md:text-4xl font-black">
                                Contact Us<span className="text-amber-300">.</span>
                            </h2>

                            <p className="mt-4 text-white/75 text-base md:text-lg leading-relaxed max-w-xl">
                                Need a pickup plan for your home or business, a quote for monthly service, or a waste management awareness session in your community? Send us a message or call, and we&apos;ll get back to you.
                            </p>

                            <div className="mt-8 grid gap-4">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Email</p>
                                    <a href="mailto:info@jigzack.com" className="mt-1 block text-lg font-bold text-amber-300">info@jigzack.com</a>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Phone</p>
                                    <a href="tel:+2347034339721" className="mt-1 block text-lg font-bold text-amber-300">0703 433 9721</a>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <p className="text-sm text-white/70">Operating cities</p>
                                    <p className="mt-1 text-white/85 font-semibold">
                                        Lagos and Port Harcourt, plus outreach programs across Nigeria
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8 animate-riseIn [animation-delay:160ms]">
                            <h3 className="text-2xl font-black">
                                Let’s schedule your service<span className="text-amber-300">.</span>
                            </h3>
                            <p className="mt-2 text-white/70">
                                Tell us what you need: a household pickup, a commercial service, or help with plastics and other recyclables.
                            </p>

                            <ContactForm />

                            <a
                                href="tel:+2347034339721"
                                className="mt-4 block rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-center font-bold text-white transition hover:bg-white/15"
                            >
                                Or call 0703 433 9721
                            </a>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
