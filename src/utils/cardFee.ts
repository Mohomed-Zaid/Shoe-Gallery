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
