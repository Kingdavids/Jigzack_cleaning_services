export default function ContactPage() {
    return (
        <main>
            <section className="relative px-6 md:px-10 py-24 overflow-hidden">
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
    );
}
