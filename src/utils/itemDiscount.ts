const CURRENCY_SCALE = 100;

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * CURRENCY_SCALE) / CURRENCY_SCALE;
}

export function getDiscountPrice(
  originalUnitPrice: number,
  discountPrice: number | undefined,
  lineDiscount = 0,
  quantity = 1,
): number {
  if (Number.isFinite(discountPrice)) return Number(discountPrice);
  const safeQuantity = Math.max(Number(quantity) || 1, 1);
  return roundCurrency(originalUnitPrice - (Number(lineDiscount) || 0) / safeQuantity);
}

export function calculateItemDiscount(
  originalUnitPrice: number,
  discountPrice: number,
  quantity: number,
): { unitDiscount: number; lineDiscount: number; lineTotal: number } {
  const unitDiscount = roundCurrency(originalUnitPrice - discountPrice);
  return {
    unitDiscount,
    lineDiscount: roundCurrency(unitDiscount * quantity),
    lineTotal: roundCurrency(discountPrice * quantity),
  };
}

export function getDiscountPriceError(originalUnitPrice: number, discountPrice: number): string | null {
  if (!Number.isFinite(discountPrice) || discountPrice < 0) {
    return 'Discount price cannot be negative.';
  }
  if (discountPrice > originalUnitPrice) {
    return 'Discount price cannot be higher than the selling price.';
  }
  return null;
}
