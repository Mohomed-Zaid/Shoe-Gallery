import { supabase } from './supabase';
import type { Supplier } from '../types';

export async function getSuppliers() {
  return supabase.from('suppliers').select('*').order('created_at', { ascending: false });
}

export async function getSupplierById(id: string) {
  return supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
}

export async function createSupplier(data: Omit<Supplier, 'id' | 'created_at'>) {
  return supabase.from('suppliers').insert(data).select().single();
}

export async function updateSupplier(id: string, data: Partial<Omit<Supplier, 'id' | 'created_at'>>) {
  return supabase.from('suppliers').update(data).eq('id', id);
}

export async function deleteSupplier(id: string) {
  return supabase.from('suppliers').delete().eq('id', id);
}
