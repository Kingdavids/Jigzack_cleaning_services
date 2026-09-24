// Safe to import from both server and client code (no Node-only modules).

export const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";

const PEOPLE = "from_profile:profiles!messages_from_profile_id_fkey(full_name), to_profile:profiles!messages_to_profile_id_fkey(full_name)";
const BASE_COLUMNS = "id, subject, body, created_at, parent_message_id, from_profile_id, to_profile_id, read_at, is_broadcast, group_id";

// The attachment columns come from supabase/message-attachments-2026-09.sql.
// Until that has been run, load messages without them so the page still works.
export const MESSAGE_SELECT = `${BASE_COLUMNS}, attachment_path, attachment_name, ${PEOPLE}`;
export const MESSAGE_SELECT_BASE = `${BASE_COLUMNS}, ${PEOPLE}`;
