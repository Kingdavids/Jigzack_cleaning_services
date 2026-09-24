import type { ReactNode } from "react";

// Shared layout for the privacy policy and terms: one readable column,
// numbered sections, no decoration competing with the text.
export default function LegalPage({
                                       title,
                                       updated,
                                       intro,
                                       children,
                                   }: {
    title: string;
    updated: string;
    intro: string;
    children: ReactNode;
}) {
    return (
        <main className="px-6 py-16 md:px-10 md:py-20">
            <article className="mx-auto max-w-3xl text-white">
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                    {title}
                    <span className="text-amber-300">.</span>
                </h1>
                <p className="mt-2 text-sm text-white/45">Last updated {updated}</p>
                <p className="mt-6 text-base leading-relaxed text-white/75 md:text-lg">{intro}</p>
                <div className="mt-10 space-y-10">{children}</div>
            </article>
        </main>
    );
}

export function LegalSection({ id, heading, children }: { id?: string; heading: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-28">
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">{heading}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-white/75">{children}</div>
        </section>
    );
}

export function LegalList({ items }: { items: ReactNode[] }) {
    return (
        <ul className="list-disc space-y-2 pl-5 marker:text-amber-300">
            {items.map((item, index) => (
                <li key={index}>{item}</li>
            ))}
        </ul>
    );
}
