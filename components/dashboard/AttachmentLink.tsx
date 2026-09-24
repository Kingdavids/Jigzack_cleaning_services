'use client';

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { MESSAGE_ATTACHMENT_BUCKET } from "@/lib/message-select";

// The files are private, so a link is made on demand and lasts an hour.
export default function AttachmentLink({
                                           path,
                                           name,
                                           tone = "light",
                                       }: {
    path: string;
    name: string | null;
    tone?: "light" | "dark";
}) {
    const [busy, setBusy] = useState(false);

    const open = async () => {
        setBusy(true);
        const { data, error } = await createClient().storage.from(MESSAGE_ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
        setBusy(false);

        if (error || !data?.signedUrl) {
            toast.error("Could not open that file.");
            return;
        }

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                open();
            }}
            disabled={busy}
            className={`mt-2 flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                tone === "dark"
                    ? "border-black/25 bg-black/10 text-black hover:bg-black/20"
                    : "border-white/15 bg-white/5 text-amber-300 hover:bg-white/10"
            }`}
        >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{busy ? "Opening..." : name || "Attachment"}</span>
        </button>
    );
}
