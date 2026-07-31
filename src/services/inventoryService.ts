import { supabase } from './supabase';
import type { InventoryHistory } from '../types';

export async function getInventoryHistory() {
  return supabase
    .from('inventory_history')
    .select('*, variant:product_variants(*, product:products(*)), user:profiles(*)')
    .order('created_at', { ascending: false });
}

export async function createInventoryHistory(data: Omit<InventoryHistory, 'id' | 'created_at'>) {
  return supabase.from('inventory_history').insert(data).select().single();
}

export async function adjustStock(
  variantId: string,
  changeType: 'add' | 'remove' | 'purchase' | 'sale',
  quantity: number,
  reason?: string
) {
  const { data: variant, error: fetchError } = await supabase
    .from('product_variants')
    .select('*')
    .eq('id', variantId)
    .maybeSingle();

  if (fetchError || !variant) {
    throw fetchError || new Error('Variant not found');
  }

  const previousQuantity = variant.stock_quantity;
  const newQuantity =
    changeType === 'add' || changeType === 'purchase'
      ? previousQuantity + quantity
      : previousQuantity - quantity;

  if (newQuantity < 0) {
    throw new Error('Not enough stock');
  }

  const { error: updateError } = await supabase
    .from('product_variants')
    .update({ stock_quantity: newQuantity })
    .eq('id', variantId);

  if (updateError) {
    throw updateError;
  }

  const { data: user } = await supabase.auth.getUser();

  const historyData: Omit<InventoryHistory, 'id' | 'created_at'> = {
    variant_id: variantId,
    change_type: changeType,
    quantity_changed: quantity,
    previous_quantity: previousQuantity,
    new_quantity: newQuantity,
    reason: reason || null,
    user_id: user?.user?.id || null,
  };

  await createInventoryHistory(historyData);
}
