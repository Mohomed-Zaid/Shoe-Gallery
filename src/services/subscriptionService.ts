import { supabase } from './supabase';
import type { SubscriptionAuditLog, SubscriptionDetails, SubscriptionStatus } from '../types/subscription';

export const SUPER_ADMIN_EMAIL = 'zaidn2848@gmail.com';
export const REGULAR_ADMIN_EMAIL = 'admin@gmail.com';

export function isBusinessAdminEmail(email: string | null | undefined): boolean {
  const normalizedEmail = email?.toLowerCase();
  return normalizedEmail === SUPER_ADMIN_EMAIL || normalizedEmail === REGULAR_ADMIN_EMAIL;
}
export const SUBSCRIPTION_QUERY_KEY = ['system-subscription'] as const;

function firstRow<T>(data: T[] | T | null): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Subscription status is unavailable.');
  return row;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { data, error } = await supabase.rpc('get_subscription_status');
  if (error) throw error;
  return firstRow(data as SubscriptionStatus[] | null);
}

export async function getSubscriptionDetails(): Promise<SubscriptionDetails> {
  const { data, error } = await supabase.rpc('get_subscription_details');
  if (error) throw error;
  return firstRow(data as SubscriptionDetails[] | null);
}

async function adminAction(name: string, args?: Record<string, unknown>) {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || error.details || `The ${name} operation failed.`);
}

export const activateSubscription = () => adminAction('activate_subscription');
export const renewSubscription = () => adminAction('renew_subscription');
export const reopenSubscription = () => adminAction('reopen_subscription');
export const suspendSubscription = (reason: string) => adminAction('suspend_subscription', { reason });
export const setSubscriptionExpiry = (newExpiry: string) =>
  adminAction('set_subscription_expiry', { new_expiry: newExpiry });

export async function getSubscriptionAuditLogs(): Promise<SubscriptionAuditLog[]> {
  const { data, error } = await supabase
    .from('subscription_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as SubscriptionAuditLog[];
}
