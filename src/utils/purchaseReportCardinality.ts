import type { PurchaseReportRow } from '../types/purchaseReport';

export function assertUniquePurchaseReportRows(rows: PurchaseReportRow[]) {
  const ids = rows.map((row) => row.purchase_id);
  if (ids.length !== new Set(ids).size) {
    if (import.meta.env.DEV) console.error('Duplicate purchases detected in Purchase Report');
    throw new Error('Purchase Report returned duplicate purchase rows.');
  }
}
