import type { PurchaseReportPreset } from '../types/purchaseReport';

const iso = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function purchasePresetDates(preset: PurchaseReportPreset) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  if (preset === 'all_time') return { startDate: '', endDate: '' };
  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === 'last_7_days') {
    start.setDate(start.getDate() - 6);
  } else if (preset === 'this_month') {
    start.setDate(1);
  } else if (preset === 'last_month') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }
  return { startDate: iso(start), endDate: iso(end) };
}

export function displayPurchaseDateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) return 'All time';
  const format = (value: string) => value.split('-').reverse().join('/');
  return `${startDate ? format(startDate) : 'Beginning'} - ${endDate ? format(endDate) : 'Today'}`;
}
