import { supabase } from './supabase';
import type { Purchase } from '../types';
import { adjustStock } from './inventoryService';

export async function getPurchases() {
  return supabase
    .from('purchases')
    .select(`
      *,
      supplier:suppliers(*),
      purchase_items:purchase_items(*, variant:product_variants(*, product:products(*)))
    `)
    .order('created_at', { ascending: false });
}

export async function getPurchaseById(id: string) {
  return supabase
    .from('purchases')
    .select(`
      *,
      supplier:suppliers(*),
      purchase_items:purchase_items(*, variant:product_variants(*, product:products(*)))
    `)
    .eq('id', id)
    .maybeSingle();
}

export async function createPurchase(data: {
  supplier_id: string | null;
  purchase_date?: string;
  payment_status?: string;
  items: {
    variant_id: string;
    quantity: number;
    cost_price: number;
  }[];
}) {
  const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.cost_price, 0);
  
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      supplier_id: data.supplier_id,
      purchase_date: data.purchase_date || new Date().toISOString(),
      total_amount: totalAmount,
      payment_status: data.payment_status || 'unpaid',
    })
    .select()
    .single();

  if (purchaseError) {
    throw purchaseError;
  }

  const purchaseItemsData = data.items.map(item => ({
    purchase_id: purchase.id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    cost_price: item.cost_price,
  }));

  const { error: itemsError } = await supabase
    .from('purchase_items')
    .insert(purchaseItemsData);

  if (itemsError) {
    throw itemsError;
  }

  // Update stock and inventory history
  for (const item of data.items) {
    await adjustStock(item.variant_id, 'add', item.quantity, `Purchase #${purchase.id}`);
  }

  return purchase;
}

export async function updatePurchase(id: string, data: Partial<Purchase>) {
  return supabase.from('purchases').update(data).eq('id', id);
}

export async function deletePurchase(id: string) {
  return supabase.from('purchases').delete().eq('id', id);
}
