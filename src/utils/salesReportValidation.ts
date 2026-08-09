import type { SalesReportFilters } from '../types/salesReport';

export function validateSalesReportFilters(filters: SalesReportFilters) {
  if (!filters.startDate || !filters.endDate) {
    throw new Error('Select both From and To dates.');
  }
  if (filters.startDate > filters.endDate) {
    throw new Error('From date must be before To date.');
  }
}
