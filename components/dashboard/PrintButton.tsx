"use client";

export default function PrintButton() {
    return (
        <button
            onClick={() => window.print()}
            className="rounded-xl bg-black px-5 py-3 text-white print:hidden"
        >
            Download / Print Invoice
        </button>
    );
}
