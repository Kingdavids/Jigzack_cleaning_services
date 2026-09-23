import Link from "next/link";

export default function NotFound() {
    return (
        <main className="flex min-h-[70vh] items-center justify-center px-6 py-24">
            <div className="max-w-md text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Error 404</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">We can&apos;t find that page</h1>
                <p className="mt-3 text-white/65">
                    The link may be old or mistyped. Head back to the home page and try again.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Link
                        href="/"
                        className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-black transition hover:bg-amber-300"
                    >
                        Go to home page
                    </Link>
                    <Link
                        href="/contact"
                        className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                    >
                        Contact us
                    </Link>
                </div>
            </div>
        </main>
    );
}
