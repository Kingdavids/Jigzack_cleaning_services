import { ReactNode } from "react";

export default function SectionCard({
                                        id,
                                        title,
                                        description,
                                        children,
                                    }: {
    id?: string;
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/8 pb-4">
                <div>
                    <h2 className="text-lg font-bold tracking-tight md:text-xl">
                        {title}
                        <span className="text-amber-300">.</span>
                    </h2>
                    {description && <p className="mt-1 text-sm leading-relaxed text-white/50">{description}</p>}
                </div>
            </div>
            {children}
        </section>
    );
}