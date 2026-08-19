export type ExpenseReportPreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'last_month' | 'this_year' | 'all_time' | 'custom';
export type ExpenseReportSort = 'newest' | 'oldest' | 'expense_asc' | 'amount_desc' | 'amount_asc';
export type ExpenseReportPageSize = 25 | 50 | 100;

export interface ExpenseReportFilters {
  startDate: string;
  endDate: string;
  search: string;
  recordedById: string;
  sessionId: string;
  paymentMethod: '' | 'cash';
}

export interface ExpenseReportRow {
  expense_id: string;
  session_id: string;
  user_id: string;
  amount: number;
  description: string;
  expense_time: string;
  created_at: string;
  recorded_by: string;
  cashup_number: string;
  payment_method: 'cash';
}

export interface ExpenseReportSummary {
  total_expenses: number;
  expense_count: number;
  today_expenses: number;
  this_month_expenses: number;
  cash_expenses: number;
  non_cash_expenses: number;
}

export interface ExpenseDailySummary { date: string; expense_count: number; total_expenses: number }
export interface ExpensePaymentSummary { payment_method: string; expense_count: number; total_amount: number }
export interface ExpenseTrendPoint { period: string; total: number }
export interface ExpenseOption { id: string; name: string }
export interface ExpenseReportOptions { recordedBy: ExpenseOption[]; cashups: ExpenseOption[] }

export interface ExpenseReportResult {
  rows: ExpenseReportRow[];
  total: number;
  summary: ExpenseReportSummary;
  daily: ExpenseDailySummary[];
  payments: ExpensePaymentSummary[];
  trend: ExpenseTrendPoint[];
  options: ExpenseReportOptions;
}

export interface ExpenseReportExportData extends Omit<ExpenseReportResult, 'rows' | 'total'> {
  rows: ExpenseReportRow[];
  generatedAt: string;
}
