// A registration fee that was not paid because the customer was already with us
// is recorded as "paid" so their account opens, but with this note. Anything
// carrying it is not money received.
export const WAIVED_REFERENCE = "Existing customer, fee waived";

export const isWaivedFee = (reference: string | null | undefined) => /waived/i.test(reference ?? "");
