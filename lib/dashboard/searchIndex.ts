// A hand-kept map of admin pages and the features on them, so the dashboard
// search can jump straight to the right place instead of an admin hunting
// through the sidebar. Add an entry here whenever a page grows a feature
// worth finding this way.

export type SearchEntry = {
    label: string;
    description: string;
    href: string;
    keywords: string[];
};

export const ADMIN_SEARCH_INDEX: SearchEntry[] = [
    { label: "Dashboard", description: "Business overview: revenue, tasks, signups at a glance", href: "/admin", keywords: ["home", "overview", "summary"] },

    { label: "Signup approvals", description: "Approve, decline or reopen pending signups", href: "/admin/approvals", keywords: ["pending", "approve", "reject", "new signup"] },
    { label: "Declined signups", description: "Delete a declined signup for good (owner only)", href: "/admin/approvals", keywords: ["decline", "reject", "delete declined"] },

    { label: "Customers", description: "Every customer's details, property, schedule and billing", href: "/admin/customers", keywords: ["customer list", "search customer"] },
    { label: "Signed up, no details yet", description: "Logins with no customer record: email or delete them", href: "/admin/customers", keywords: ["no details", "unfinished signup", "orphan"] },
    { label: "Confirm a stuck signup's email", description: "Manually confirm an email when Supabase's mailer fails (owner only)", href: "/admin/customers", keywords: ["confirm email", "verification", "stuck signup", "not receiving email"] },
    { label: "Recently deleted customers", description: "Restore a deleted customer within 30 days (owner only)", href: "/admin/customers", keywords: ["restore customer", "undelete", "recover"] },
    { label: "Delete a customer", description: "Move a customer to Recently deleted", href: "/admin/customers", keywords: ["remove customer", "delete account"] },
    { label: "Customer discount", description: "Set or remove a percent or flat discount for a customer", href: "/admin/customers", keywords: ["off", "percent off", "reduce price"] },
    { label: "Monthly charge override", description: "Set a fixed amount used for a customer's invoices instead of the calculated one", href: "/admin/customers", keywords: ["fixed charge", "custom price", "override rate"] },
    { label: "Arrears", description: "Add or change arrears carried onto an invoice", href: "/admin/customers", keywords: ["balance forward", "carried over", "owed from before"] },
    { label: "Advance payments", description: "Record a customer who paid several months upfront", href: "/admin/customers", keywords: ["prepay", "prepayment", "paid in advance"] },
    { label: "Registration fee", description: "Confirm or clear a customer's one-off registration fee", href: "/admin/payments#registration-fees", keywords: ["signup fee", "activation fee"] },
    { label: "Money in & out", description: "Monthly money received and spent, by category", href: "/admin/finance", keywords: ["finance", "cash flow", "inflow", "outflow", "income", "spending", "net", "report"] },
    { label: "Suspend or reactivate a customer", description: "Pause billing and pickups without deleting anything", href: "/admin/customers", keywords: ["pause", "freeze account"] },
    { label: "Email a customer", description: "Send a one-off email to a customer or signup", href: "/admin/customers", keywords: ["contact customer", "send email"] },
    { label: "Preview an invoice before generating", description: "See what this month's invoice will look like before it's created", href: "/admin/customers", keywords: ["invoice preview", "before sending"] },

    { label: "Estates", description: "Multi-unit properties billed as one account, with tenants underneath", href: "/admin/estates", keywords: ["multi-unit", "landlord", "tenants"] },
    { label: "Promote a customer to an estate", description: "Turn an approved customer into an estate account", href: "/admin/estates", keywords: ["make estate"] },
    { label: "Estate unit pricing", description: "Give a unit its own type, custom price, or quantity", href: "/admin/estates", keywords: ["unit price", "custom rate", "duplex price", "per unit"] },
    { label: "Mark a unit vacant", description: "Leave a unit out of an estate's monthly total", href: "/admin/estates", keywords: ["empty unit", "no tenant"] },
    { label: "Link a tenant to a unit", description: "Give a tenant read access to their estate's bill", href: "/admin/estates", keywords: ["assign tenant", "unit tenant"] },

    { label: "Employees", description: "Invite, remove or restore employee accounts", href: "/admin/employees", keywords: ["staff", "invite employee", "remove employee"] },

    { label: "Tasks", description: "Every pickup: assign staff, reschedule, mark serviced", href: "/admin/tasks", keywords: ["pickups", "schedule", "assign", "crew"] },
    { label: "Uploads", description: "Before/after photos from completed pickups", href: "/admin/uploads", keywords: ["photos", "pictures"] },

    { label: "Messages", description: "Conversations between admins, customers and employees", href: "/admin/messages", keywords: ["chat", "inbox"] },
    { label: "Broadcast message", description: "Send one message (and optional email) to many customers at once", href: "/admin/messages", keywords: ["mass message", "announcement", "notify everyone"] },

    { label: "Payments", description: "Invoices needing attention, paid invoices, and one-off invoices", href: "/admin/payments", keywords: ["invoices", "billing", "money owed"] },
    { label: "Generate monthly invoices", description: "Create this month's invoice for every active customer", href: "/admin/payments", keywords: ["run billing", "create invoices"] },
    { label: "Record a payment", description: "Mark an invoice paid, or record a part payment", href: "/admin/payments", keywords: ["mark paid", "part payment", "installment"] },
    { label: "Bank transfer reported by customer", description: "Review and confirm a transfer a customer says they made", href: "/admin/payments", keywords: ["transfer report", "confirm transfer"] },
    { label: "Delete invoices", description: "Bulk-delete selected invoices (owner only)", href: "/admin/payments", keywords: ["bulk delete invoice"] },
    { label: "Create a one-off invoice", description: "For anything outside the monthly charge", href: "/admin/payments", keywords: ["extra charge", "manual invoice"] },

    { label: "Expenses", description: "Employee expense claims and receipts", href: "/admin/expenses", keywords: ["claims", "reimbursement"] },

    { label: "Admins", description: "Manage other admin accounts and permissions", href: "/admin/admins", keywords: ["admin accounts", "supervisor", "view-only admin"] },

    { label: "Activity log", description: "Who changed what, across the whole app", href: "/admin/activity", keywords: ["audit log", "history", "who did this"] },

    { label: "Oversight", description: "Every conversation and record, for the owner only", href: "/admin/oversight", keywords: ["owner only", "read everything"] },
];
