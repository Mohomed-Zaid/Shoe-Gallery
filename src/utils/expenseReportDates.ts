import type { ExpenseReportPreset } from '../types/expenseReport';

export const EXPENSE_TIME_ZONE = 'Asia/Colombo';

export function expenseBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EXPENSE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function expensePresetDates(preset: ExpenseReportPreset) {
  const today = expenseBusinessDate();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (preset === 'all_time') return { startDate: '', endDate: '' };
  if (preset === 'today') return { startDate: today, endDate: today };
  if (preset === 'yesterday') { const date = shiftDate(today, -1); return { startDate: date, endDate: date }; }
  if (preset === 'last_7_days') return { startDate: shiftDate(today, -6), endDate: today };
  if (preset === 'this_month') return { startDate: `${today.slice(0, 8)}01`, endDate: today };
  if (preset === 'this_year') return { startDate: `${year}-01-01`, endDate: today };
  if (preset === 'last_month') {
    const start = new Date(Date.UTC(year, month - 2, 1));
    const end = new Date(Date.UTC(year, month - 1, 0));
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }
  return { startDate: today, endDate: today };
}

export function expenseDateRange(startDate: string, endDate: string) {
  const display = (value: string) => value.split('-').reverse().join('/');
  if (!startDate && !endDate) return 'All time';
  return `${startDate ? display(startDate) : 'Beginning'} - ${endDate ? display(endDate) : 'Today'}`;
}

export function expenseLocalDate(value: string) {
  return expenseBusinessDate(new Date(value));
}

export function formatExpenseDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EXPENSE_TIME_ZONE,
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
