'use client';

import { useEffect } from "react";
import { markMessagesRead } from "@/lib/messaging-actions";

export default function MarkMessagesReadOnView({ unreadCount }: { unreadCount: number }) {
    useEffect(() => {
        if (unreadCount > 0) {
            markMessagesRead();
        }
        // Only ever needs to fire once per page load, right after the
        // unread badge has already been rendered with the pre-read count.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
