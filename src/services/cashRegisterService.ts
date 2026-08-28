import { supabase } from './supabase';
import type { BankDeposit, CashRegisterSession, CashRegisterSummary } from '../types/cashRegister';

export const CASH_REGISTER_CHANGED_EVENT = 'shoe-gallery-cash-register-changed';
export const AUTO_CLOSED_REGISTER_MESSAGE = 'Previous cash register was automatically closed at midnight. Open a new cash register to continue.';

export interface EnsureCashRegisterResult {
  register: CashRegisterSummary | null;
  auto_closed: boolean;
}

export async function ensureCurrentCashRegister(): Promise<EnsureCashRegisterResult> {
  const { data, error } = await supabase.rpc('ensure_current_cash_register');
  if (error) throw error;
  const result = (data ?? {}) as Partial<EnsureCashRegisterResult>;
  return { register: result.register ?? null, auto_closed: Boolean(result.auto_closed) };
}

export async function requireCurrentCashRegister(): Promise<CashRegisterSummary> {
  const result = await ensureCurrentCashRegister();
  if (!result.register) {
    if (result.auto_closed) notifyCashRegisterChanged();
    throw new Error(result.auto_closed ? AUTO_CLOSED_REGISTER_MESSAGE : 'Cash register is closed. Open a new cash register to continue.');
  }
  return result.register;
}

export async function autoCloseExpiredRegisters() {
  const { data, error } = await supabase.rpc('auto_close_expired_cash_registers');
  if (error) throw error;
  return Number(data ?? 0);
}

export function notifyCashRegisterChanged() {
  window.dispatchEvent(new Event(CASH_REGISTER_CHANGED_EVENT));
}

function colomboBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function millisecondsUntilNextColomboMidnight(now = new Date()) {
  const [year, month, day] = colomboBusinessDate(now).split('-').map(Number);
  const nextMidnightUtc = Date.UTC(year, month - 1, day + 1, 0, 0, 0) - 5.5 * 60 * 60 * 1000;
  return Math.max(nextMidnightUtc - now.getTime(), 0);
}

export async function getCurrentRegister() {
  return (await ensureCurrentCashRegister()).register;
}

export async function getRegisterSummary(id: string) {
  const { data, error } = await supabase.rpc('get_cash_register_summary', { p_session_id: id });
  if (error) throw error;
  return data as CashRegisterSummary;
}

export async function openRegister(openingBalance: number, notes: string) {
  const { data, error } = await supabase.rpc('open_cash_register', { p_opening_balance: openingBalance, p_notes: notes });
  if (error) throw error;
  notifyCashRegisterChanged();
  return data as string;
}

export async function closeRegister(id: string, actualCash: number, notes: string) {
  const { data, error } = await supabase.rpc('close_cash_register', { p_session_id: id, p_actual_cash: actualCash, p_notes: notes });
  if (error) throw error;
  notifyCashRegisterChanged();
  return data as CashRegisterSummary;
}

export async function addCashExpense(sessionId: string, amount: number, description: string) {
  const current = await requireCurrentCashRegister();
  if (current.id !== sessionId) throw new Error(AUTO_CLOSED_REGISTER_MESSAGE);
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('cash_register_expenses').insert({ session_id: sessionId, user_id: user?.id, amount, description });
  if (error) throw error;
  notifyCashRegisterChanged();
}

export async function recordBankDeposit(sessionId: string, amount: number, bankName: string, reference: string, notes: string) {
  const current = await requireCurrentCashRegister();
  if (current.id !== sessionId) throw new Error(AUTO_CLOSED_REGISTER_MESSAGE);
  const { error } = await supabase.rpc('record_bank_deposit', {
    p_session_id: sessionId, p_amount: amount, p_bank_name: bankName,
    p_reference: reference || null, p_notes: notes || null,
  });
  if (error) throw error;
  notifyCashRegisterChanged();
}

export async function getSessionBankDeposits(sessionId: string) {
  const { data, error } = await supabase.from('cash_register_movements')
    .select('id,cash_register_id,amount,bank_name,reference,notes,created_at,created_by,recorder:profiles!cash_register_movements_created_by_fkey(full_name,email)')
    .eq('cash_register_id', sessionId).eq('movement_type', 'bank_deposit').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    ...item, amount: Number(item.amount),
    recorded_by: item.recorder?.full_name || item.recorder?.email || 'Cashier',
  })) as BankDeposit[];
}

export async function getRegisterSessions(page = 1, pageSize = 20) {
  const { data, error, count } = await supabase.from('cash_register_sessions')
    .select('*,cashier:profiles(full_name,email)', { count: 'exact' })
    .order('opening_time', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as CashRegisterSession[], count: count ?? 0 };
}
