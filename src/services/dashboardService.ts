import { supabase } from './supabase';
import { calculateProfitTotals, type ProfitReturnItem, type ProfitSaleItem } from '../utils/profitCalculation';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SalesTrendFilter = 'today' | '7d' | '30d' | 'month' | 'year';

export interface DashboardCards {
  todaySales: number;
  todayRevenue: number;
  todayProfit: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  totalProducts: number;
  totalCustomers: number;
  totalSuppliers: number;
  inventoryValue: number;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface RevenueProfitPoint {
  label: string;
  revenue: number;
  profit: number;
}

export interface TopProduct {
  name: string;
  quantity: number;
}

export interface CategorySales {
  name: string;
  value: number;
}

export interface MonthlyRevenuePt {
  month: string;
  revenue: number;
}

export interface LowStockItem {
  id: string;
  productName: string;
  size: string;
  color: string;
  stock: number;
  limit: number;
}

export interface RecentSale {
  id: string;
  invoice_number: string | null;
  customer: string;
  cashier: string;
  amount: number;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function endOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

// ─── Dashboard Cards ────────────────────────────────────────────────────────

export async function getDashboardCards(): Promise<DashboardCards> {
  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();
  const monthStart = startOfMonth(now).toISOString();

  const [
    todaySalesRes,
    monthlySalesRes,
    productsRes,
    customersRes,
    suppliersRes,
    inventoryRes,
    saleItemsRes,
    returnedItemsRes,
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('id, total_amount')
      .in('status', ['completed', 'partially_returned', 'fully_returned'])
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd),
    supabase
      .from('sales')
      .select('id, total_amount')
      .in('status', ['completed', 'partially_returned', 'fully_returned'])
      .gte('created_at', monthStart),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('suppliers').select('id', { count: 'exact', head: true }),
    supabase.from('product_variants').select('cost_price, stock_quantity'),
    supabase
      .from('sale_items')
      .select(`
        sale_id,
        quantity,
        cost_price_at_sale,
        cost_price
      `),
    supabase
      .from('sales_return_items')
      .select('quantity_returned, return_total, cost_price_at_sale, return:sales_returns!inner(sale_id, status)')
      .eq('return.status', 'completed'),
  ]);

  const allSaleItemsData = (saleItemsRes.data ?? []) as unknown as ProfitSaleItem[];
  type ReturnedItemRow = Omit<ProfitReturnItem, 'sale_id'> & { return: { sale_id: string } | null };
  const returnedItems = ((returnedItemsRes.data ?? []) as unknown as ReturnedItemRow[])
    .filter((item) => item.return?.sale_id)
    .map((item) => ({ ...item, sale_id: item.return!.sale_id }));
  const todaySaleIds = new Set((todaySalesRes.data ?? []).map((sale) => sale.id));
  const monthSaleIds = new Set((monthlySalesRes.data ?? []).map((sale) => sale.id));
  const todaySaleItemsData = allSaleItemsData.filter((item) => todaySaleIds.has(item.sale_id));
  const todayTotals = calculateProfitTotals(todaySalesRes.data ?? [], todaySaleItemsData, returnedItems);

  // Monthly profit — fetch separately for the month
  const monthSaleItemsData = allSaleItemsData.filter((item) => monthSaleIds.has(item.sale_id));
  const monthlyTotals = calculateProfitTotals(monthlySalesRes.data ?? [], monthSaleItemsData, returnedItems);

  const inventoryValue = (inventoryRes.data ?? []).reduce(
    (s, v) => s + Number(v.cost_price) * Number(v.stock_quantity),
    0
  );

  return {
    todaySales: (todaySalesRes.data ?? []).length,
    todayRevenue: todayTotals.revenue,
    todayProfit: todayTotals.profit,
    monthlyRevenue: monthlyTotals.revenue,
    monthlyProfit: monthlyTotals.profit,
    totalProducts: productsRes.count ?? 0,
    totalCustomers: customersRes.count ?? 0,
    totalSuppliers: suppliersRes.count ?? 0,
    inventoryValue,
  };
}

// ─── Sales Trend ─────────────────────────────────────────────────────────────

export async function getSalesTrend(filter: SalesTrendFilter): Promise<TrendPoint[]> {
  const now = new Date();
  let fromDate: Date;

  if (filter === 'today') {
    fromDate = startOfDay(now);
  } else if (filter === '7d') {
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 6);
    fromDate = startOfDay(fromDate);
  } else if (filter === '30d') {
    fromDate = new Date(now);
    fromDate.setDate(now.getDate() - 29);
    fromDate = startOfDay(fromDate);
  } else if (filter === 'month') {
    fromDate = startOfMonth(now);
  } else {
    // year
    fromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  const { data } = await supabase
    .from('sales')
    .select('created_at, total_amount')
    .in('status', ['completed', 'partially_returned', 'fully_returned'])
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: true });

  const sales = (data ?? []) as Array<{ created_at: string; total_amount: number }>;

  if (filter === 'today') {
    // Group by hour 0–23
    const map = new Map<number, number>();
    for (let h = 0; h <= now.getHours(); h++) map.set(h, 0);
    for (const s of sales) {
      const h = new Date(s.created_at).getHours();
      map.set(h, (map.get(h) ?? 0) + Number(s.total_amount));
    }
    return Array.from(map.entries()).map(([h, v]) => ({
      label: `${String(h).padStart(2, '0')}:00`,
      value: v,
    }));
  } else if (filter === 'year') {
    const map = new Map<string, number>();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m = 0; m <= now.getMonth(); m++) map.set(months[m], 0);
    for (const s of sales) {
      const key = months[new Date(s.created_at).getMonth()];
      map.set(key, (map.get(key) ?? 0) + Number(s.total_amount));
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  } else {
    // Group by date
    const map = new Map<string, number>();
    const days = filter === '7d' ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      map.set(key, 0);
    }
    for (const s of sales) {
      const key = new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(s.total_amount));
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }
}

// ─── Revenue vs Profit Trend ─────────────────────────────────────────────────

export async function getRevenueProfitTrend(): Promise<RevenueProfitPoint[]> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 29);
  from.setHours(0, 0, 0, 0);

  const { data: salesData } = await supabase
    .from('sales')
    .select('id, created_at, total_amount')
    .in('status', ['completed', 'partially_returned', 'fully_returned'])
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: true });

  const sales = (salesData ?? []) as Array<{ id: string; created_at: string; total_amount: number }>;

  const saleIds = sales.map((sale) => sale.id);
  const [itemsResult, returnsResult] = saleIds.length ? await Promise.all([
    supabase.from('sale_items')
      .select('sale_id, quantity, cost_price_at_sale, cost_price')
      .in('sale_id', saleIds),
    supabase.from('sales_return_items')
      .select('quantity_returned, return_total, cost_price_at_sale, return:sales_returns!inner(sale_id, status)')
      .in('return.sale_id', saleIds)
      .eq('return.status', 'completed'),
  ]) : [{ data: [] }, { data: [] }];
  const items = (itemsResult.data ?? []) as unknown as ProfitSaleItem[];
  type TrendReturnRow = Omit<ProfitReturnItem, 'sale_id'> & { return: { sale_id: string } | null };
  const returnedItems = ((returnsResult.data ?? []) as unknown as TrendReturnRow[])
    .filter((item) => item.return?.sale_id)
    .map((item) => ({ ...item, sale_id: item.return!.sale_id }));
  const saleItems = new Map<string, ProfitSaleItem[]>();
  const saleReturns = new Map<string, ProfitReturnItem[]>();
  for (const item of items) saleItems.set(item.sale_id, [...(saleItems.get(item.sale_id) ?? []), item]);
  for (const item of returnedItems) saleReturns.set(item.sale_id, [...(saleReturns.get(item.sale_id) ?? []), item]);

  const map = new Map<string, { revenue: number; profit: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    map.set(key, { revenue: 0, profit: 0 });
  }

  for (const s of sales) {
    const key = new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    if (map.has(key)) {
      const prev = map.get(key)!;
      const totals = calculateProfitTotals([s], saleItems.get(s.id) ?? [], saleReturns.get(s.id) ?? []);
      map.set(key, { revenue: prev.revenue + totals.revenue, profit: prev.profit + totals.profit });
    }
  }

  return Array.from(map.entries()).map(([label, v]) => ({ label, ...v }));
}

// ─── Top Selling Products ────────────────────────────────────────────────────

export async function getTopSellingProducts(): Promise<TopProduct[]> {
  const { data } = await supabase
    .from('sale_items')
    .select('quantity, product_name_snapshot, variant:product_variants(product:products(name))');

  type ItemRow = {
    quantity: number;
    product_name_snapshot: string | null;
    variant: { product: { name: string } | null } | null;
  };

  const items = (data ?? []) as unknown as ItemRow[];
  const map = new Map<string, number>();

  for (const item of items) {
    const name = item.product_name_snapshot?.replace(' (Instant Sale)', '') ??
      item.variant?.product?.name ?? 'Unknown';
    map.set(name, (map.get(name) ?? 0) + item.quantity);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }));
}

// ─── Sales by Category ───────────────────────────────────────────────────────

export async function getSalesByCategory(): Promise<CategorySales[]> {
  const { data } = await supabase
    .from('sale_items')
    .select('quantity, is_instant_sale, variant:product_variants(product:products(category:categories(name)))');

  type ItemRow = {
    quantity: number;
    is_instant_sale: boolean | null;
    variant: { product: { category: { name: string } | null } | null } | null;
  };

  const items = (data ?? []) as unknown as ItemRow[];
  const map = new Map<string, number>();

  for (const item of items) {
    const name = item.is_instant_sale
      ? 'Instant Sale'
      : item.variant?.product?.category?.name ?? 'Uncategorized';
    map.set(name, (map.get(name) ?? 0) + item.quantity);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

// ─── Monthly Revenue (current year) ─────────────────────────────────────────

export async function getMonthlyRevenue(): Promise<MonthlyRevenuePt[]> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const { data } = await supabase
    .from('sales')
    .select('created_at, total_amount')
    .eq('status', 'completed')
    .gte('created_at', yearStart);

  const sales = (data ?? []) as Array<{ created_at: string; total_amount: number }>;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const map = new Map<string, number>(months.map((m) => [m, 0]));

  for (const s of sales) {
    const key = months[new Date(s.created_at).getMonth()];
    map.set(key, (map.get(key) ?? 0) + Number(s.total_amount));
  }

  return months.map((month) => ({ month, revenue: map.get(month) ?? 0 }));
}

// ─── Low Stock Products ──────────────────────────────────────────────────────

export async function getLowStockProducts(): Promise<LowStockItem[]> {
  const { data: settingsData } = await supabase
    .from('store_settings')
    .select('default_low_stock_limit')
    .maybeSingle();

  const limit = Number((settingsData as { default_low_stock_limit: number } | null)?.default_low_stock_limit ?? 10);

  const { data } = await supabase
    .from('product_variants')
    .select('id, size, color, stock_quantity, product:products(name)')
    .lt('stock_quantity', limit)
    .order('stock_quantity', { ascending: true })
    .limit(20);

  type VariantRow = {
    id: string;
    size: string;
    color: string;
    stock_quantity: number;
    product: { name: string } | null;
  };

  return ((data ?? []) as unknown as VariantRow[]).map((v) => ({
    id: v.id,
    productName: v.product?.name ?? 'Unknown',
    size: v.size,
    color: v.color,
    stock: v.stock_quantity,
    limit,
  }));
}

// ─── Recent Sales ─────────────────────────────────────────────────────────────

export async function getRecentSales(): Promise<RecentSale[]> {
  const { data } = await supabase
    .from('sales')
    .select(`
      id,
      invoice_number,
      total_amount,
      created_at,
      customer:customers(name),
      cashier:profiles(full_name, email)
    `)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(10);

  type SaleRow = {
    id: string;
    invoice_number: string | null;
    total_amount: number;
    created_at: string;
    customer: { name: string } | null;
    cashier: { full_name: string | null; email: string | null } | null;
  };

  return ((data ?? []) as unknown as SaleRow[]).map((s) => ({
    id: s.id,
    invoice_number: s.invoice_number,
    customer: s.customer?.name ?? 'Walk-in Customer',
    cashier: s.cashier?.full_name ?? s.cashier?.email ?? 'Cashier',
    amount: Number(s.total_amount),
    created_at: s.created_at,
  }));
}
