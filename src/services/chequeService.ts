import { supabase } from './supabase';
import type { Cheque } from '../types';

export type ChequeInput = Pick<Cheque, 'name' | 'cheque_number' | 'bank' | 'cheque_date'>;

export async function getCheques() {
  return supabase.from('cheques').select('*');
}

export async function createCheque(data: ChequeInput) {
  return supabase.from('cheques').insert(data);
}

export async function updateCheque(id: string, data: ChequeInput) {
  return supabase.from('cheques').update(data).eq('id', id);
}

export async function deleteCheque(id: string) {
  return supabase.from('cheques').delete().eq('id', id);
}
