import { supabase } from './supabase';
import type { Category } from '../types';

export async function getCategories() {
  return supabase.from('categories').select('*').order('created_at', { ascending: false });
}

export async function createCategory(data: Pick<Category, 'name' | 'description'>) {
  return supabase.from('categories').insert(data);
}

export async function updateCategory(id: string, data: Pick<Category, 'name' | 'description'>) {
  return supabase.from('categories').update(data).eq('id', id);
}

export async function deleteCategory(id: string) {
  return supabase.from('categories').delete().eq('id', id);
}
