import { supabase } from './supabase';
import { getTodayExpenseTotal } from './expenseReportService';
import { getCustomerSaleAmount } from '../utils/cardFee';

export type SalesTrendFilter = 'today' | '7d' | '30d' | 'month';

export interface DashboardCards {
  todaySales: number;
  todayRevenue: number;
  todayExpenses: number;
  todayProfit: number;
  todayReturns: number;
  totalProducts: number;
  totalStockUnits: number;
  inventoryValue: number;
  lowStockVariants: number;
  outOfStockVariants: number;
}

export interface TrendPoint { label: string; value: number; }
export interface RevenueProfitPoint { label: string; revenue: number; profit: number; }
export interface TopProduct { name: string; quantity: number; }
export interface CategorySales { name: string; value: number; }
export interface MonthlyRevenuePt { month: string; revenue: number; }

export interface RecentSale {
  id: string;
  invoice_number: string | null;
  customer: string;
  itemCount: number;
  paymentMethod: string;
  amount: number;
  created_at: string;
}

const BUSINESS_TIME_ZONE = 'Asia/Colombo';

function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function getDashboardCards(): Promise<DashboardCards> {
  const today = businessDate();
  const [businessResult, returnsResult, inventoryResult, expensesResult] = await Promise.all([
    supabase.rpc('get_profit_dashboard_summary', { p_start_date: today, p_end_date: today }),
    supabase.rpc('get_returns_report', {
      p_start_date: today, p_end_date: today, p_search: null, p_return_type: null,
      p_status: 'completed', p_customer_id: null, p_processor_id: null,
      p_restock_status: null, p_page: 1, p_page_size: 25, p_sort: 'newest',
    }),
    supabase.rpc('get_inventory_report', {
      p_search: null, p_category_id: null, p_brand_id: null, p_stock_status: null,
      p_page: 1, p_page_size: 25, p_sort: 'product_asc',
    }),
    getTodayExpenseTotal(),
  ]);
  if (businessResult.error) throw businessResult.error;
  if (returnsResult.error) throw returnsResult.error;
  if (inventoryResult.error) throw inventoryResult.error;

  const business = (businessResult.data ?? {}) as { revenue?: number; profit?: number; sales?: number };
  const returns = (returnsResult.data ?? {}) as { summary?: { return_value?: number } };
  const inventory = (inventoryResult.data ?? {}) as { summary?: Record<string, number> };
  const summary = inventory.summary ?? {};

  return {
    todaySales: Number(business.sales ?? 0),
    todayRevenue: Number(business.revenue ?? 0),
    todayExpenses: expensesResult,
    todayProfit: Number(business.profit ?? 0),
    todayReturns: Number(returns.summary?.return_value ?? 0),
    totalProducts: Number(summary.total_products ?? 0),
    totalStockUnits: Number(summary.total_stock ?? 0),
    inventoryValue: Number(summary.cost_value ?? 0),
    lowStockVariants: Number(summary.low_stock_variants ?? 0),
    outOfStockVariants: Number(summary.out_of_stock_variants ?? 0),
  };
}

export async function getSalesTrend(filter: SalesTrendFilter): Promise<TrendPoint[]> {
  const endDate = businessDate();
  const startDate = filter === 'today' ? endDate
    : filter === '7d' ? addDays(endDate, -6)
    : filter === '30d' ? addDays(endDate, -29)
    : `${endDate.slice(0, 8)}01`;
  const { data, error } = await supabase.rpc('get_profit_report', {
    p_filters: { startDate, endDate }, p_page: 1, p_page_size: 25, p_sort: 'newest',
  });
  if (error) throw error;

  const daily = ((data ?? {}) as { daily?: Array<{ date: string; revenue: number }> }).daily ?? [];
  const values = new Map(daily.map((point) => [point.date, Number(point.revenue ?? 0)]));
  const count = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(startDate, index);
    const label = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
    return { label, value: values.get(date) ?? 0 };
  });
}

export async function getRecentSales(): Promise<RecentSale[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('id,invoice_number,total_amount,card_payment_fee,created_at,payment_method,customer:customers(name),sale_items(id)')
    .in('status', ['completed', 'partially_returned', 'fully_returned'])
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;

  type SaleRow = {
    id: string; invoice_number: string | null; total_amount: number; card_payment_fee: number; created_at: string;
    payment_method: string; customer: { name: string } | null; sale_items: Array<{ id: string }> | null;
  };
  return ((data ?? []) as unknown as SaleRow[]).map((sale) => ({
    id: sale.id,
    invoice_number: sale.invoice_number,
    customer: sale.customer?.name ?? 'Walk-in Customer',
    itemCount: sale.sale_items?.length ?? 0,
    paymentMethod: sale.payment_method,
    amount: getCustomerSaleAmount(sale.total_amount, sale.card_payment_fee),
    created_at: sale.created_at,
  }));
}
