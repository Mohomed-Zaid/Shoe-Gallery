import { supabase } from './supabase';
import type { Profile, UserRole } from '../types';
import { SUPER_ADMIN_EMAIL } from './subscriptionService';

async function isProtectedSuperAdmin(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('email').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

export async function getUsers() {
  return supabase.from('profiles').select('*').order('created_at', { ascending: false });
}

export async function updateUserRole(id: string, role: UserRole) {
  if (await isProtectedSuperAdmin(id)) throw new Error('The super-admin account cannot be edited or downgraded.');
  return supabase.from('profiles').update({ role }).eq('id', id);
}

export async function updateUserProfile(id: string, data: Partial<Pick<Profile, 'full_name' | 'email' | 'role'>>) {
  if (await isProtectedSuperAdmin(id)) throw new Error('The super-admin account cannot be edited.');
  return supabase.from('profiles').update(data).eq('id', id);
}
