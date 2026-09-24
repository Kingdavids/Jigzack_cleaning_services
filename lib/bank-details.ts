// Where customers send bank transfers. Shown on invoices, receipts and the
// registration fee page, so a change here updates all of them.
export const BANK_ACCOUNT = {
    name: "JIGZACK CLEANING SERVICES",
    banks: [
        { bank: "Sterling Bank", number: "0079266810" },
        { bank: "GTBank", number: "0562133368" },
    ],
};

// Private storage bucket for the receipts customers upload.
export const PAYMENT_RECEIPT_BUCKET = "payment-receipts";
