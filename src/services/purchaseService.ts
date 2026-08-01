import { supabase } from './supabase';
import type { PurchaseFilters, PurchasePayload, PurchaseRecord } from '../types/purchase';

const purchaseSelect = `*, supplier:suppliers(*),
  purchase_items(*, variant:product_variants(*, product:products(*))), supplier_payments(*)`;

export async function getPurchases(filters: PurchaseFilters) {
  let query = supabase.from('purchases').select(purchaseSelect, { count: 'exact' });
  if (filters.search) query = query.or(`purchase_number.ilike.%${filters.search}%,supplier_invoice_number.ilike.%${filters.search}%`);
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId);
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
  if (filters.from) query = query.gte('purchase_date', filters.from);
  if (filters.to) query = query.lte('purchase_date', filters.to);
  const from = (filters.page - 1) * filters.pageSize;
  return query.order('created_at', { ascending: false }).range(from, from + filters.pageSize - 1);
}

export async function getPurchaseById(id: string): Promise<PurchaseRecord> {
  const { data, error } = await supabase.from('purchases').select(purchaseSelect).eq('id', id).single();
  if (error) throw error;
  return data as unknown as PurchaseRecord;
}

export async function savePurchase(payload: PurchasePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_purchase', { p_payload: payload });
  if (error) throw error;
  return data as string;
}

export async function recordSupplierPayment(purchaseId: string, amount: number, paymentMethod: string, referenceNumber: string, notes: string) {
  const { error } = await supabase.rpc('record_supplier_payment', {
    p_purchase_id: purchaseId, p_amount: amount, p_payment_method: paymentMethod,
    p_reference_number: referenceNumber || null, p_notes: notes || null,
  });
  if (error) throw error;
}

export async function cancelPurchase(purchaseId: string, reason: string) {
  const { error } = await supabase.rpc('cancel_purchase', { p_purchase_id: purchaseId, p_reason: reason });
  if (error) throw error;
}
