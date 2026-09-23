'use client';

import { useState } from "react";
import { Check, Copy, Download, Mail, MessageCircle, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

// Print, save as a PDF, or share an invoice/receipt with another app
// (WhatsApp, email, ...). The PDF is rendered from the on-screen document, so
// what's shared is exactly what's printed: one A4 page.
export default function DocumentActions({
                                             targetId,
                                             fileName,
                                             title,
                                             shareText,
                                             printLabel = "Print",
                                         }: {
    targetId: string;
    fileName: string;
    title: string;
    shareText: string;
    printLabel?: string;
}) {
    const [busy, setBusy] = useState<"pdf" | "share" | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const buildPdf = async () => {
        const node = document.getElementById(targetId);
        if (!node) throw new Error("Document not found");

        const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

        const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Could not read the rendered document"));
            image.src = dataUrl;
        });

        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 8;

        // Fit the whole document on one page, whatever its length.
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const ratio = image.height / image.width;
        let w = maxW;
        let h = w * ratio;
        if (h > maxH) {
            h = maxH;
            w = h / ratio;
        }

        pdf.addImage(dataUrl, "PNG", (pageW - w) / 2, margin, w, h);

        return pdf.output("blob");
    };

    const download = async () => {
        try {
            setBusy("pdf");
            const blob = await buildPdf();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${fileName}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            toast.error("Couldn't create the PDF. Try Print, then Save as PDF.");
        } finally {
            setBusy(null);
        }
    };

    const share = async () => {
        try {
            setBusy("share");
            const blob = await buildPdf();
            const file = new File([blob], `${fileName}.pdf`, { type: "application/pdf" });

            if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title, text: shareText });
                return;
            }

            setMenuOpen(true);
        } catch (err) {
            // Closing the share sheet without choosing an app isn't an error.
            if ((err as Error)?.name !== "AbortError") {
                console.error(err);
                setMenuOpen(true);
            }
        } finally {
            setBusy(null);
        }
    };

    const pageLink = typeof window !== "undefined" ? window.location.href : "";
    const message = `${shareText}\n${pageLink}`;

    const copyLink = async () => {
        await navigator.clipboard.writeText(pageLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const buttonClass =
        "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

    return (
        <div className="relative print:hidden">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => window.print()} className={`${buttonClass} bg-black text-white hover:bg-black/85`}>
                    <Printer className="h-4 w-4" />
                    {printLabel}
                </button>
                <button
                    type="button"
                    onClick={download}
                    disabled={busy !== null}
                    className={`${buttonClass} border border-black/20 bg-white/70 text-black hover:bg-white`}
                >
                    <Download className="h-4 w-4" />
                    {busy === "pdf" ? "Preparing…" : "Download PDF"}
                </button>
                <button
                    type="button"
                    onClick={share}
                    disabled={busy !== null}
                    className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-500`}
                >
                    <Share2 className="h-4 w-4" />
                    {busy === "share" ? "Preparing…" : "Share"}
                </button>
            </div>

            {menuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-black/15 bg-white p-3 text-sm text-black shadow-xl">
                    <p className="mb-2 text-xs text-black/55">
                        Sharing a file isn&apos;t supported here. Download the PDF to attach it, or send a message:
                    </p>
                    <div className="space-y-1">
                        <a
                            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-black/5"
                        >
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            WhatsApp
                        </a>
                        <a
                            href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-black/5"
                        >
                            <Mail className="h-4 w-4" />
                            Email
                        </a>
                        <button type="button" onClick={copyLink} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-black/5">
                            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            {copied ? "Link copied" : "Copy link"}
                        </button>
                        <button type="button" onClick={download} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-black/5">
                            <Download className="h-4 w-4" />
                            Download PDF to attach
                        </button>
                    </div>
                    <p className="mt-2 text-[11px] text-black/45">The link only opens for people signed in to this account.</p>
                    <button type="button" onClick={() => setMenuOpen(false)} className="mt-2 text-xs font-semibold text-black/60 hover:text-black">
                        Close
                    </button>
                </div>
            )}
        </div>
    );
}
