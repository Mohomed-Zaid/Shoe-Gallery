import type { InventoryStockStatus } from '../types/inventoryReport';
import { formatCurrency } from './format';

export function formatInventoryPriceRange(min: number | null, max: number | null) {
  if (min === null || max === null) return 'Missing';
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
}

export function inventoryStatusLabel(status: InventoryStockStatus) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
