import type { SalesReportRow } from '../types/salesReport';

export function assertUniqueSalesReportRows(rows: SalesReportRow[]) {
  if (!import.meta.env.DEV) return;
  const ids = rows.map((row) => row.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    console.error('[Sales Report] Duplicate sale IDs detected', duplicates);
  }
}
