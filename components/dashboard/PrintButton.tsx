"use client";

export default function PrintButton({ label = "Download / Print Invoice" }: { label?: string }) {
    return (
        <button
            onClick={() => window.print()}
            className="rounded-xl bg-black px-5 py-3 text-white print:hidden"
        >
            {label}
        </button>
    );
}
