import { ReactNode } from "react";

export default function SectionCard({
                                        title,
                                        description,
                                        children,
                                    }: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.04] p-5 md:p-6 backdrop-blur-2xl shadow-[0_25px_60px_-30px_rgba(0,0,0,0.85)]">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/8 pb-4">
                <div>
                    <h2 className="text-xl font-black tracking-tight md:text-2xl">
                        {title}
                        <span className="text-amber-300">.</span>
                    </h2>
                    {description && <p className="mt-1 text-sm leading-relaxed text-white/55">{description}</p>}
                </div>
            </div>
            {children}
        </section>
    );
}