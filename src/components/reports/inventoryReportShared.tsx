import type { InventoryStockStatus } from '../../types/inventoryReport';
import { inventoryStatusLabel } from '../../utils/inventoryReportFormat';

export function InventoryStatusBadge({ status }: { status: InventoryStockStatus }) { const tone = status === 'in_stock' ? 'bg-emerald-500/15 text-emerald-300' : status === 'low_stock' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'; return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{inventoryStatusLabel(status)}</span>; }
