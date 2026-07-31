import { supabase } from './supabase';
import type { Profile, UserRole } from '../types';

export async function getUsers() {
  return supabase.from('profiles').select('*').order('created_at', { ascending: false });
}

export async function updateUserRole(id: string, role: UserRole) {
  return supabase.from('profiles').update({ role }).eq('id', id);
}

export async function updateUserProfile(id: string, data: Partial<Pick<Profile, 'full_name' | 'email' | 'role'>>) {
  return supabase.from('profiles').update(data).eq('id', id);
}
