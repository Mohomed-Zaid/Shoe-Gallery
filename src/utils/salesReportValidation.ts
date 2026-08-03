import type { SalesReportFilters } from '../types/salesReport';
export function validateSalesReportFilters(f: SalesReportFilters) {
  if (!f.startDate || !f.endDate) throw new Error('Select both From and To dates.');
  if (f.startDate > f.endDate) throw new Error('From date must be before To date.');
  if (f.minTotal && f.maxTotal && Number(f.minTotal) > Number(f.maxTotal)) throw new Error('Minimum total cannot exceed maximum total.');
}
