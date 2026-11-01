// Shared by the staff expense form, the server actions and the admin page.

export const EXPENSE_CATEGORIES = [
    { value: "fuel", label: "Fuel" },
    { value: "transport", label: "Transport" },
    { value: "repairs", label: "Repairs" },
    { value: "supplies", label: "Supplies" },
    { value: "meals", label: "Meals" },
    // Cash paid for material. Counts as the cost in the recyclables profit.
    { value: "recyclables", label: "Recyclables bought" },
    // What it costs to handle the material, apart from buying it. Also a cost in the recyclables profit.
    { value: "recyclables_transport", label: "Recyclables: transport" },
    { value: "recyclables_loading", label: "Recyclables: loading and offloading" },
    { value: "recyclables_gate", label: "Recyclables: gate and security" },
    { value: "recyclables_other", label: "Recyclables: other costs" },
    { value: "other", label: "Other" },
] as const;

// Every category that belongs to recyclables, and the ones that are costs of handling rather than buying.
export const RECYCLABLES_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.value.startsWith("recyclables"));
export const RECYCLABLES_COST_CATEGORIES = RECYCLABLES_CATEGORIES.filter((c) => c.value !== "recyclables").map((c) => c.value);

// What the general expense forms offer: the handling costs are logged on the Recyclables page instead.
export const GENERAL_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => !(RECYCLABLES_COST_CATEGORIES as string[]).includes(c.value));

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export type ExpenseStatus = "submitted" | "approved" | "reimbursed" | "rejected";

// Which statuses an expense may move to each status from: waiting → approved
// or rejected; approved → reimbursed or rejected; a rejected one can be
// reconsidered. Reimbursed is final: the money has been paid back.
export const EXPENSE_STEPS_FROM: Record<"approved" | "reimbursed" | "rejected", ExpenseStatus[]> = {
    approved: ["submitted", "rejected"],
    rejected: ["submitted", "approved"],
    reimbursed: ["approved"],
};

export const canMoveExpense = (from: ExpenseStatus, to: "approved" | "reimbursed" | "rejected") => EXPENSE_STEPS_FROM[to].includes(from);

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
