const CURRENCY_SCALE = 100;

export function calculateCompanyCost(sellingPrice: number, percentage: number): number {
  if (!Number.isFinite(sellingPrice) || !Number.isFinite(percentage)) return 0;

  const costPrice = sellingPrice - (sellingPrice * percentage / 100);
  return Math.round((costPrice + Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}
