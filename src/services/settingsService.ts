import { supabase } from './supabase';
import type { StoreSettings } from '../types';

export async function getStoreSettings() {
  return supabase.from('store_settings').select('*').maybeSingle();
}

export async function updateStoreSettings(id: string, data: Partial<Omit<StoreSettings, 'id' | 'created_at' | 'updated_at'>>) {
  return supabase.from('store_settings').update(data).eq('id', id).select().single();
}
