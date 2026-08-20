import type { ReturnableItem, ReturnableSale } from '../types/salesReturn';
import { roundCurrency } from './itemDiscount';

export function calculateHistoricalPaidUnitValue(sale: ReturnableSale, item: ReturnableItem): number {
  const invoiceDiscountBasis = sale.sale_items.reduce((sum, saleItem) => sum + Number(saleItem.line_total), 0);
  const itemNetValue = Number(item.line_total);
  const invoiceDiscountShare = invoiceDiscountBasis > 0
    ? Number(sale.invoice_discount_amount ?? 0) * itemNetValue / invoiceDiscountBasis
    : 0;
  return roundCurrency(Math.max((itemNetValue - invoiceDiscountShare) / item.quantity, 0));
}

export function calculateExchangeDifference(exchangeCredit: number, replacementValue: number) {
  const signedDifference = roundCurrency(replacementValue - exchangeCredit);
  return {
    signedDifference,
    differenceAmount: Math.abs(signedDifference),
    differenceType: signedDifference > 0
      ? 'customer_pays' as const
      : signedDifference < 0
        ? 'customer_refund' as const
        : 'even' as const,
  };
}
