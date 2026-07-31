import { supabase } from './supabase';
import type { Brand } from '../types';

export async function getBrands() {
  return supabase.from('brands').select('*').order('created_at', { ascending: false });
}

export async function createBrand(data: Pick<Brand, 'name'>) {
  return supabase.from('brands').insert(data);
}

export async function updateBrand(id: string, data: Pick<Brand, 'name'>) {
  return supabase.from('brands').update(data).eq('id', id);
}

export async function deleteBrand(id: string) {
  return supabase.from('brands').delete().eq('id', id);
}
