import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_RECEIPT_BYTES, RECEIPT_EXTENSIONS } from "@/lib/expenses";

import { MESSAGE_ATTACHMENT_BUCKET, MESSAGE_SELECT, MESSAGE_SELECT_BASE } from "@/lib/message-select";

export { MESSAGE_ATTACHMENT_BUCKET };

// Loads a person's messages with the attachment columns, or without them if the
// attachments SQL has not been run yet. `run` builds the query for a given
// column list, for example
// loadMessages((select) => supabase.from("messages").select(select).eq(...)).
export async function loadMessages(run: (select: string) => PromiseLike<{ data: unknown; error: unknown }>) {
    const first = await run(MESSAGE_SELECT);
    if (!first.error) return first.data;

    return (await run(MESSAGE_SELECT_BASE)).data;
}

export type SavedAttachment = { path: string; name: string };

// Validates and stores the optional "attachment" file of a message form.
// Returns null when no file was chosen.
export async function saveMessageAttachment(
    supabase: SupabaseClient,
    profileId: string,
    formData: FormData
): Promise<SavedAttachment | null | { error: string }> {
    const file = formData.get("attachment");

    if (!(file instanceof File) || file.size === 0) return null;

    const extension = RECEIPT_EXTENSIONS[file.type];

    if (!extension || file.size > MAX_RECEIPT_BYTES) {
        return { error: "The attachment must be a photo or PDF under 10MB." };
    }

    const path = `${profileId}/${randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).upload(path, file, { upsert: false });

    if (error) {
        console.error("Message attachment upload failed:", error.message);
        return { error: "Could not upload the attachment. Please try again." };
    }

    return { path, name: (file.name || `attachment.${extension}`).slice(0, 120) };
}

// Removes files that no message points at any more.
export async function removeUnreferencedAttachments(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
    const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];

    if (unique.length === 0) return;

    const { data: stillUsed } = await supabase.from("messages").select("attachment_path").in("attachment_path", unique);
    const keep = new Set((stillUsed ?? []).map((row) => row.attachment_path as string));
    const remove = unique.filter((p) => !keep.has(p));

    if (remove.length > 0) {
        await supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).remove(remove);
    }
}
