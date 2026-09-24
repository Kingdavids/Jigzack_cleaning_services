// Shared by the staff expense form, the server actions and the admin page.

export const EXPENSE_CATEGORIES = [
    { value: "fuel", label: "Fuel" },
    { value: "transport", label: "Transport" },
    { value: "repairs", label: "Repairs" },
    { value: "supplies", label: "Supplies" },
    { value: "meals", label: "Meals" },
    { value: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export type ExpenseStatus = "submitted" | "approved" | "reimbursed" | "rejected";

export const categoryLabel = (value: string) => EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;

export const RECEIPT_BUCKET = "expense-receipts";
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const RECEIPT_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
};

export type ExpenseRow = {
    id: string;
    amount: number;
    category: string;
    note: string | null;
    expense_date: string;
    receipt_path: string | null;
    status: ExpenseStatus;
    admin_note: string | null;
    created_at: string;
    employee: { full_name: string | null } | null;
    task: { title: string | null } | null;
};
