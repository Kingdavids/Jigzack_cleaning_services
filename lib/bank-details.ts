import { BUSINESS } from "@/lib/config/business";

// Where customers send bank transfers. Shown on invoices, receipts and the
// registration fee page, so a change here updates all of them.
export const BANK_ACCOUNT = {
    name: BUSINESS.bank.accountName,
    banks: BUSINESS.bank.banks,
};

// Private storage bucket for the receipts customers upload.
export const PAYMENT_RECEIPT_BUCKET = "payment-receipts";
