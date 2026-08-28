export const CARD_PROCESSING_FEE_RATE = 0.0275;

export function calculateCardFee(cardAmount: number): number {
  const amount = Number(cardAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * CARD_PROCESSING_FEE_RATE * 100) / 100;
}

export function calculateNetCardAmount(cardAmount: number): number {
  const amount = Number(cardAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round((amount - calculateCardFee(amount)) * 100) / 100;
}

/** Normalize legacy surcharge rows for display without changing stored data. */
export function getCustomerSaleAmount(totalAmount: number, legacyCardSurcharge = 0): number {
  const total = Number(totalAmount);
  const surcharge = Number(legacyCardSurcharge);
  if (!Number.isFinite(total)) return 0;
  return Math.round(Math.max(total - (Number.isFinite(surcharge) ? surcharge : 0), 0) * 100) / 100;
}
