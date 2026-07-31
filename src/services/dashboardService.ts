import { supabase } from './supabase';

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
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('total_amount')
      .eq('status', 'completed')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd),
    supabase
      .from('sales')
      .select('total_amount')
      .eq('status', 'completed')
      .gte('created_at', monthStart),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('suppliers').select('id', { count: 'exact', head: true }),
    supabase.from('product_variants').select('cost_price, stock_quantity'),
    supabase
      .from('sale_items')
      .select(`
        quantity,
        selling_price,
        is_instant_sale,
        variant:product_variants(cost_price)
      `)
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd),
  ]);

  const todayRevenue = (todaySalesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);
  const monthlyRevenue = (monthlySalesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0);

  // Profit = (selling_price - cost_price) * quantity for non-instant items
  type SaleItemRow = {
    quantity: number;
    selling_price: number;
    is_instant_sale: boolean | null;
    variant: { cost_price: number } | null;
  };
  const todaySaleItemsData = (saleItemsRes.data ?? []) as unknown as SaleItemRow[];
  const todayProfit = todaySaleItemsData.reduce((s, item) => {
    if (item.is_instant_sale) return s + Number(item.selling_price) * item.quantity;
    const cost = Number(item.variant?.cost_price ?? 0);
    return s + (Number(item.selling_price) - cost) * item.quantity;
  }, 0);

  // Monthly profit — fetch separately for the month
  const monthSaleItemsRes = await supabase
    .from('sale_items')
    .select(`quantity, selling_price, is_instant_sale, variant:product_variants(cost_price)`)
    .gte('created_at', monthStart);

  const monthSaleItemsData = (monthSaleItemsRes.data ?? []) as unknown as SaleItemRow[];
  const monthlyProfit = monthSaleItemsData.reduce((s, item) => {
    if (item.is_instant_sale) return s + Number(item.selling_price) * item.quantity;
    const cost = Number(item.variant?.cost_price ?? 0);
    return s + (Number(item.selling_price) - cost) * item.quantity;
  }, 0);

  const inventoryValue = (inventoryRes.data ?? []).reduce(
    (s, v) => s + Number(v.cost_price) * Number(v.stock_quantity),
    0
  );

  return {
    todaySales: (todaySalesRes.data ?? []).length,
    todayRevenue,
    todayProfit,
    monthlyRevenue,
    monthlyProfit,
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
    .eq('status', 'completed')
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
    .eq('status', 'completed')
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: true });

  const sales = (salesData ?? []) as Array<{ id: string; created_at: string; total_amount: number }>;

  const { data: itemsData } = await supabase
    .from('sale_items')
    .select('sale_id, quantity, selling_price, is_instant_sale, variant:product_variants(cost_price)')
    .gte('created_at', from.toISOString());

  type ItemRow = { sale_id: string; quantity: number; selling_price: number; is_instant_sale: boolean | null; variant: { cost_price: number } | null };
  const items = (itemsData ?? []) as unknown as ItemRow[];

  // Map sale_id -> profit
  const saleProfit = new Map<string, number>();
  for (const item of items) {
    const prev = saleProfit.get(item.sale_id) ?? 0;
    const profit = item.is_instant_sale
      ? Number(item.selling_price) * item.quantity
      : (Number(item.selling_price) - Number(item.variant?.cost_price ?? 0)) * item.quantity;
    saleProfit.set(item.sale_id, prev + profit);
  }

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
      map.set(key, {
        revenue: prev.revenue + Number(s.total_amount),
        profit: prev.profit + (saleProfit.get(s.id) ?? 0),
      });
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
