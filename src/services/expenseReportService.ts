import { supabase } from './supabase';
import type {
  ExpenseDailySummary, ExpensePaymentSummary, ExpenseReportExportData, ExpenseReportFilters,
  ExpenseReportPageSize, ExpenseReportResult, ExpenseReportRow, ExpenseReportSort, ExpenseTrendPoint,
} from '../types/expenseReport';
import { expenseBusinessDate, expenseLocalDate } from '../utils/expenseReportDates';

const BATCH_SIZE = 1000;
const CACHE_MS = 30_000;
let cachedRows: ExpenseReportRow[] | undefined;
let cacheTime = 0;

type RawExpense = {
  id: string; session_id: string; user_id: string; amount: number | string; description: string;
  expense_time: string; created_at: string;
  user: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null;
  session: { id: string } | Array<{ id: string }> | null;
};

const relation = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? (value[0] ?? null) : value;
const cashupNumber = (id: string) => `CS-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;

function normalize(row: RawExpense): ExpenseReportRow {
  const user = relation(row.user);
  const session = relation(row.session);
  return {
    expense_id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    amount: Number(row.amount),
    description: row.description,
    expense_time: row.expense_time,
    created_at: row.created_at,
    recorded_by: user?.full_name || user?.email || 'Cashier',
    cashup_number: cashupNumber(session?.id || row.session_id),
    payment_method: 'cash',
  };
}

function validateUnique(rows: ExpenseReportRow[]) {
  const ids = rows.map((row) => row.expense_id);
  if (ids.length !== new Set(ids).size) {
    if (import.meta.env.DEV) console.error('Expenses Report contains duplicate expense rows');
    throw new Error('Expenses Report contains duplicate expense rows.');
  }
}

async function loadExpenseRows(refresh = false): Promise<ExpenseReportRow[]> {
  if (!refresh && cachedRows && Date.now() - cacheTime < CACHE_MS) return cachedRows;
  const rows: ExpenseReportRow[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await supabase
      .from('cash_register_expenses')
      .select('id,session_id,user_id,amount,description,expense_time,created_at,user:profiles(full_name,email),session:cash_register_sessions(id)')
      .order('expense_time', { ascending: false })
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    const batch = ((data ?? []) as unknown as RawExpense[]).map(normalize);
    rows.push(...batch);
    if (batch.length < BATCH_SIZE) break;
  }
  validateUnique(rows);
  cachedRows = rows;
  cacheTime = Date.now();
  return rows;
}

function filterRows(rows: ExpenseReportRow[], filters: ExpenseReportFilters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const date = expenseLocalDate(row.expense_time);
    return (!filters.startDate || date >= filters.startDate)
      && (!filters.endDate || date <= filters.endDate)
      && (!filters.recordedById || row.user_id === filters.recordedById)
      && (!filters.sessionId || row.session_id === filters.sessionId)
      && (!filters.paymentMethod || row.payment_method === filters.paymentMethod)
      && (!search || [row.description, row.recorded_by, row.cashup_number, row.expense_id].some((value) => value.toLowerCase().includes(search)));
  });
}

function sortRows(rows: ExpenseReportRow[], sort: ExpenseReportSort) {
  return [...rows].sort((a, b) => {
    if (sort === 'oldest') return a.expense_time.localeCompare(b.expense_time);
    if (sort === 'expense_asc') return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
    if (sort === 'amount_desc') return b.amount - a.amount;
    if (sort === 'amount_asc') return a.amount - b.amount;
    return b.expense_time.localeCompare(a.expense_time);
  });
}

function dailySummary(rows: ExpenseReportRow[]): ExpenseDailySummary[] {
  const values = new Map<string, ExpenseDailySummary>();
  for (const row of rows) {
    const date = expenseLocalDate(row.expense_time);
    const value = values.get(date) ?? { date, expense_count: 0, total_expenses: 0 };
    value.expense_count += 1;
    value.total_expenses += row.amount;
    values.set(date, value);
  }
  return [...values.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function paymentSummary(rows: ExpenseReportRow[]): ExpensePaymentSummary[] {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return rows.length ? [{ payment_method: 'Cash', expense_count: rows.length, total_amount: total }] : [];
}

function trendSummary(rows: ExpenseReportRow[], filters: ExpenseReportFilters): ExpenseTrendPoint[] {
  const days = filters.startDate && filters.endDate
    ? Math.floor((Date.parse(`${filters.endDate}T00:00:00Z`) - Date.parse(`${filters.startDate}T00:00:00Z`)) / 86_400_000) + 1
    : Number.POSITIVE_INFINITY;
  const byDay = days <= 62;
  const values = new Map<string, number>();
  for (const row of rows) {
    const date = expenseLocalDate(row.expense_time);
    const period = byDay ? date : date.slice(0, 7);
    values.set(period, (values.get(period) ?? 0) + row.amount);
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([period, total]) => ({ period, total }));
}

function createResult(allRows: ExpenseReportRow[], filters: ExpenseReportFilters, page: number, pageSize: ExpenseReportPageSize, sort: ExpenseReportSort): ExpenseReportResult {
  const filtered = sortRows(filterRows(allRows, filters), sort);
  const today = expenseBusinessDate();
  const thisMonth = today.slice(0, 7);
  const totalExpenses = filtered.reduce((sum, row) => sum + row.amount, 0);
  return {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    summary: {
      total_expenses: totalExpenses,
      expense_count: filtered.length,
      today_expenses: allRows.filter((row) => expenseLocalDate(row.expense_time) === today).reduce((sum, row) => sum + row.amount, 0),
      this_month_expenses: allRows.filter((row) => expenseLocalDate(row.expense_time).startsWith(thisMonth)).reduce((sum, row) => sum + row.amount, 0),
      cash_expenses: totalExpenses,
      non_cash_expenses: 0,
    },
    daily: dailySummary(filtered),
    payments: paymentSummary(filtered),
    trend: trendSummary(filtered, filters),
    options: {
      recordedBy: [...new Map(allRows.map((row) => [row.user_id, { id: row.user_id, name: row.recorded_by }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
      cashups: [...new Map(allRows.map((row) => [row.session_id, { id: row.session_id, name: row.cashup_number }])).values()].sort((a, b) => b.name.localeCompare(a.name)),
    },
  };
}

export async function getExpensesReport(filters: ExpenseReportFilters, page: number, pageSize: ExpenseReportPageSize, sort: ExpenseReportSort, refresh = false) {
  return createResult(await loadExpenseRows(refresh), filters, page, pageSize, sort);
}

export async function getExpensesReportExportData(filters: ExpenseReportFilters, sort: ExpenseReportSort): Promise<ExpenseReportExportData> {
  const allRows = await loadExpenseRows();
  const result = createResult(allRows, filters, 1, 100 as ExpenseReportPageSize, sort);
  return { ...result, rows: sortRows(filterRows(allRows, filters), sort), generatedAt: new Date().toISOString() };
}

export async function getTodayExpenseTotal() {
  const today = expenseBusinessDate();
  return (await loadExpenseRows()).filter((row) => expenseLocalDate(row.expense_time) === today).reduce((sum, row) => sum + row.amount, 0);
}
