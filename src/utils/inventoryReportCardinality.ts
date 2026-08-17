import type { InventoryReportRow } from '../types/inventoryReport';

export function assertUniqueInventoryReportRows(rows: InventoryReportRow[]) {
  const ids = rows.map((row) => row.product_id);
  if (ids.length !== new Set(ids).size) {
    if (import.meta.env.DEV) console.error('Duplicate products detected in Inventory Report');
    throw new Error('Inventory Report returned duplicate product rows.');
  }
}
