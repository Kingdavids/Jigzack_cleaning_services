import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function SectionCard({
                                        id,
                                        title,
                                        description,
                                        collapsible = false,
                                        defaultOpen = false,
                                        badge,
                                        children,
                                    }: {
    id?: string;
    title: string;
    description?: string;
    // Folds the card away behind its heading. Closed unless defaultOpen is set.
    collapsible?: boolean;
    defaultOpen?: boolean;
    // A short status shown beside the heading, handy when the card is folded.
    badge?: ReactNode;
    children: ReactNode;
}) {
    const heading = (
        <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
            <div>
                <h2 className="text-lg font-bold tracking-tight md:text-xl">
                    {title}
                    <span className="text-amber-300">.</span>
                </h2>
                {description && <p className="mt-1 text-sm leading-relaxed text-white/50">{description}</p>}
            </div>
            {badge && <div className="shrink-0">{badge}</div>}
        </div>
    );

    if (collapsible) {
        return (
            <details id={id} open={defaultOpen} className="group scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-5 md:p-6 [&::-webkit-details-marker]:hidden">
                    {heading}
                    <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-white/8 p-5 pt-5 md:p-6">{children}</div>
            </details>
        );
    }

    return (
        <section id={id} className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/8 pb-4">
                {heading}
            </div>
            {children}
        </section>
    );
}
