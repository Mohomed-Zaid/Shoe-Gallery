import type { ReportPreset } from '../types/salesReport';

const localDate = (date: Date) => date.toLocaleDateString('en-CA');

export function presetDates(preset: ReportPreset) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }
  if (preset === 'last_7_days') start.setDate(start.getDate() - 6);
  if (preset === 'this_month') start.setDate(1);
  return { startDate: localDate(start), endDate: localDate(end) };
}
