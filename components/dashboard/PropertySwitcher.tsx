'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PropertyOption } from "@/lib/dashboard/propertyLinks";

// Shown only for a customer with more than one property linked to their
// login. Picking one reloads the current page for that property instead.
export default function PropertySwitcher({ properties, activeProfileId }: { properties: PropertyOption[]; activeProfileId: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    if (properties.length <= 1) return null;

    const change = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());

        if (value === properties[0].profileId) params.delete("property");
        else params.set("property", value);

        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    };

    return (
        <label className="flex items-center gap-2 text-sm">
            <span className="text-white/50">Property:</span>
            <select
                value={activeProfileId}
                onChange={(e) => change(e.target.value)}
                className="h-10 rounded-xl border border-white/10 bg-[#141518] px-3 text-sm text-white outline-none focus:border-amber-300/50"
            >
                {properties.map((p) => (
                    <option key={p.profileId} value={p.profileId}>
                        {p.label}
                        {p.needsDetails ? " (needs setup)" : ""}
                    </option>
                ))}
            </select>
        </label>
    );
}
