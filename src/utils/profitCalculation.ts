export interface ProfitSale { id: string; total_amount: number | string | null; }
export interface ProfitSaleItem {
  sale_id: string; quantity: number | string;
  cost_price_at_sale?: number | string | null; cost_price?: number | string | null;
}
export interface ProfitReturnItem {
  sale_id: string; quantity_returned: number | string; return_total: number | string;
  cost_price_at_sale?: number | string | null;
}
export interface ProfitTotals { revenue: number; cogs: number; profit: number; }

function finiteAmount(value: number | string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/** Uses only immutable sale-item cost fields; current inventory prices are never consulted. */
export function getHistoricalUnitCost(item: ProfitSaleItem) {
  if (item.cost_price_at_sale != null) return finiteAmount(item.cost_price_at_sale);
  if (item.cost_price != null) return finiteAmount(item.cost_price);
  return 0;
}

export function calculateProfitTotals(sales: ProfitSale[], items: ProfitSaleItem[], returnedItems: ProfitReturnItem[] = []): ProfitTotals {
  const saleIds = new Set(sales.map((sale) => sale.id));
  const grossRevenue = sales.reduce((total, sale) => total + finiteAmount(sale.total_amount), 0);
  const soldCogs = items.reduce((total, item) => saleIds.has(item.sale_id) ? total + getHistoricalUnitCost(item) * finiteAmount(item.quantity) : total, 0);
  const returnedRevenue = returnedItems.reduce((total, item) => saleIds.has(item.sale_id) ? total + finiteAmount(item.return_total) : total, 0);
  const returnedCogs = returnedItems.reduce((total, item) => saleIds.has(item.sale_id) ? total + finiteAmount(item.cost_price_at_sale) * finiteAmount(item.quantity_returned) : total, 0);
  const revenue = grossRevenue - returnedRevenue;
  const cogs = soldCogs - returnedCogs;
  return { revenue, cogs, profit: revenue - cogs };
}
