import type { PurchasePayload } from '../types/purchase';

export function validatePurchase(payload: PurchasePayload): string | null {
  if (!payload.supplier_id) return 'Select a supplier.';
  if (!payload.purchase_date) return 'Select a purchase date.';
  if (!payload.items.length) return 'Add at least one product.';
  if (payload.items.some((item) => item.quantity <= 0)) return 'Every quantity must be greater than zero.';
  if (payload.items.some((item) => item.cost_price < 0 || item.line_discount < 0)) return 'Costs and discounts cannot be negative.';
  const subtotal = payload.items.reduce((sum, item) => sum + item.quantity * item.cost_price, 0);
  const total = subtotal - payload.items.reduce((sum, item) => sum + item.line_discount, 0) - payload.discount_amount + payload.additional_cost;
  if (total < 0) return 'Discounts cannot exceed the purchase value.';
  if (payload.paid_amount < 0 || payload.paid_amount > total) return 'Paid amount cannot exceed the purchase total.';
  if (payload.status === 'completed' && payload.paid_amount > 0 && !payload.payment_method) return 'Select a payment method.';
  return null;
}
