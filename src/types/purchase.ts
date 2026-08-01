import type { Product, ProductVariant, Supplier } from './index';

export type PurchasePaymentStatus = 'paid' | 'partial' | 'unpaid';
export type PurchaseStatus = 'draft' | 'completed' | 'cancelled';
export type PaymentMethod = 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';

export interface PurchaseItemInput {
  variant_id: string; quantity: number; cost_price: number; selling_price: number | null;
  line_discount: number; update_selling_price: boolean;
}
export interface PurchasePayload {
  id?: string; supplier_id: string; supplier_invoice_number: string; purchase_date: string;
  discount_amount: number; additional_cost: number; paid_amount: number; payment_method: string;
  notes: string; status: 'draft' | 'completed'; items: PurchaseItemInput[];
}
export interface PurchaseItemRecord extends PurchaseItemInput {
  id: string; purchase_id: string; line_total: number;
  variant: ProductVariant & { product: Product };
}
export interface SupplierPaymentRecord {
  id: string; amount: number; payment_date: string; payment_method: string;
  reference_number: string | null; notes: string | null;
}
export interface PurchaseRecord {
  id: string; purchase_number: string; supplier_id: string; supplier_invoice_number: string | null;
  purchase_date: string; subtotal: number; discount_amount: number; additional_cost: number;
  total_amount: number; paid_amount: number; balance_amount: number; payment_status: PurchasePaymentStatus;
  payment_method: string | null; notes: string | null; status: PurchaseStatus; cancellation_reason: string | null;
  created_at: string; created_by_email: string | null; supplier: Supplier; purchase_items: PurchaseItemRecord[];
  supplier_payments: SupplierPaymentRecord[];
}
export interface PurchaseFilters {
  search?: string; supplierId?: string; paymentStatus?: string; from?: string; to?: string; page: number; pageSize: number;
}
