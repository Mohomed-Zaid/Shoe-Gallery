import { supabase } from './supabase';
import type { Customer, Product, ProductVariant, Purchase, Sale, SaleItem, Supplier, SupplierPayment } from '../types';
import { calculateProfitTotals, getHistoricalUnitCost } from '../utils/profitCalculation';

export type ReportRange = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardMetrics {
  todaySales: number;
  monthlySales: number;
  totalRevenue: number;
  grossProfit: number;
  netProfit: number;
  customers: number;
  products: number;
  lowStock: number;
  salesTrend: Array<{ label: string; value: number }>;
  monthlyRevenue: Array<{ label: string; revenue: number }>;
  categoryBreakdown: Array<{ label: string; value: number }>;
  topProducts: Array<{ label: string; value: number }>;
  recentSales: Array<Sale & { customer: Customer | null; cashier_name: string }>;
  lowStockProducts: Array<ProductVariant & { product: Product | null }>;
}

export interface ReportsBundle {
  salesSummary: {
    sales: number;
    orders: number;
    averageSale: number;
    profit: number;
  };
  inventorySummary: {
    currentStock: number;
    lowStock: number;
    outOfStock: number;
    stockValue: number;
  };
  productSummary: {
    bestSelling: Array<{ label: string; quantity: number }>;
    slowMoving: Array<{ label: string; quantity: number }>;
    mostProfitable: Array<{ label: string; amount: number }>;
  };
  customerSummary: {
    topCustomers: Array<{ label: string; amount: number }>;
    outstandingCustomers: Array<{ label: string; amount: number }>;
    purchaseHistory: Array<Sale & { customer: Customer | null }>;
  };
  supplierSummary: {
    purchases: Array<{ label: string; amount: number }>;
    outstandingPayments: Array<{ label: string; amount: number }>;
  };
}

function getDateRange(range: ReportRange, custom?: DateRange): DateRange {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'yesterday') {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'this_week') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'this_month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (custom) {
    return custom;
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const todayRange = getDateRange('today');
  const monthRange = getDateRange('this_month');

  const [
    salesResult,
    variantsResult,
    productsResult,
    customersResult,
    salesItemsResult,
    returnedItemsResult,
  ] = await Promise.all([
    supabase
      .from('sales')
      .select('*, customer:customers(*), cashier:profiles(full_name)')
      .in('status', ['completed', 'partially_returned', 'fully_returned'])
      .order('created_at', { ascending: false }),
    supabase
      .from('product_variants')
      .select('*, product:products(*, category:categories(*))')
      .order('stock_quantity', { ascending: true }),
    supabase.from('products').select('*'),
    supabase.from('customers').select('*'),
    supabase
      .from('sale_items')
      .select('*, variant:product_variants(*, product:products(*, category:categories(*)))'),
    supabase
      .from('sales_return_items')
      .select('quantity_returned,return_total,cost_price_at_sale,return:sales_returns!inner(sale_id,status)')
      .eq('return.status', 'completed'),
  ]);

  const sales = ((salesResult.data as Array<Sale & { customer: Customer | null; cashier: { full_name: string | null } | null }>) ?? [])
    .filter((sale) => ['completed', 'partially_returned', 'fully_returned'].includes(sale.status));
  const variants = (variantsResult.data as Array<ProductVariant & { product: Product & { category?: { name: string } | null } }>) ?? [];
  const products = (productsResult.data as Product[]) ?? [];
  const customers = (customersResult.data as Customer[]) ?? [];
  const saleItems = (salesItemsResult.data as Array<SaleItem & { variant: (ProductVariant & { product: Product & { category?: { name: string } | null } }) | null }>) ?? [];
  type ReturnedRow = { quantity_returned: number; return_total: number; cost_price_at_sale: number | null; return: { sale_id: string } | null };
  const returnedItems = ((returnedItemsResult.data ?? []) as unknown as ReturnedRow[])
    .filter((item) => item.return?.sale_id)
    .map((item) => ({ ...item, sale_id: item.return!.sale_id }));

  const todaySales = sales
    .filter((sale) => sale.created_at >= todayRange.from && sale.created_at <= todayRange.to)
    .reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const monthlySales = sales
    .filter((sale) => sale.created_at >= monthRange.from && sale.created_at <= monthRange.to)
    .reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const totals = calculateProfitTotals(sales, saleItems, returnedItems);
  const totalRevenue = totals.revenue;
  const grossProfit = totals.profit;
  const netProfit = grossProfit;

  const lowStockProducts = variants.filter((variant) => variant.stock_quantity > 0 && variant.stock_quantity < 10).slice(0, 10);

  const salesTrendMap = new Map<string, number>();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    salesTrendMap.set(date.toLocaleDateString('en-US', { weekday: 'short' }), 0);
  }
  sales.forEach((sale) => {
    const key = new Date(sale.created_at).toLocaleDateString('en-US', { weekday: 'short' });
    if (salesTrendMap.has(key)) {
      salesTrendMap.set(key, (salesTrendMap.get(key) ?? 0) + Number(sale.total_amount));
    }
  });

  const monthlyRevenueMap = new Map<string, number>();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - offset);
    monthlyRevenueMap.set(date.toLocaleDateString('en-US', { month: 'short' }), 0);
  }
  sales.forEach((sale) => {
    const key = new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short' });
    if (monthlyRevenueMap.has(key)) {
      monthlyRevenueMap.set(key, (monthlyRevenueMap.get(key) ?? 0) + Number(sale.total_amount));
    }
  });

  const categoryCounts = saleItems.reduce<Record<string, number>>((acc, item) => {
    const key = item.variant?.product?.category?.name ?? 'Uncategorized';
    acc[key] = (acc[key] ?? 0) + item.quantity;
    return acc;
  }, {});

  const topProductCounts = saleItems.reduce<Record<string, number>>((acc, item) => {
    const key = item.product_name_snapshot ?? item.variant?.product?.name ?? 'Unknown';
    acc[key] = (acc[key] ?? 0) + item.quantity;
    return acc;
  }, {});

  return {
    todaySales,
    monthlySales,
    totalRevenue,
    grossProfit,
    netProfit,
    customers: customers.length,
    products: products.length,
    lowStock: lowStockProducts.length,
    salesTrend: Array.from(salesTrendMap.entries()).map(([label, value]) => ({ label, value })),
    monthlyRevenue: Array.from(monthlyRevenueMap.entries()).map(([label, revenue]) => ({ label, revenue })),
    categoryBreakdown: Object.entries(categoryCounts).map(([label, value]) => ({ label, value })).slice(0, 5),
    topProducts: Object.entries(topProductCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value })),
    recentSales: sales.slice(0, 5).map((sale) => ({
      ...sale,
      customer: sale.customer ?? null,
      cashier_name: sale.cashier?.full_name ?? 'Unknown',
    })),
    lowStockProducts,
  };
}

export async function getReportsBundle(range: ReportRange, custom?: DateRange): Promise<ReportsBundle> {
  const dateRange = getDateRange(range, custom);

  const [salesResult, saleItemsResult, returnedItemsResult, variantsResult, purchasesResult, supplierPaymentsResult, customersResult, suppliersResult] = await Promise.all([
    supabase
      .from('sales')
      .select('*, customer:customers(*)')
      .gte('created_at', dateRange.from)
      .lte('created_at', dateRange.to)
      .in('status', ['completed', 'partially_returned', 'fully_returned'])
      .order('created_at', { ascending: false }),
    supabase
      .from('sale_items')
      .select('*, variant:product_variants(*, product:products(*))'),
    supabase
      .from('sales_return_items')
      .select('sale_item_id,quantity_returned,return_total,cost_price_at_sale,return:sales_returns!inner(sale_id,status)')
      .eq('return.status', 'completed'),
    supabase
      .from('product_variants')
      .select('*, product:products(*)'),
    supabase
      .from('purchases')
      .select('*, supplier:suppliers(*)')
      .gte('created_at', dateRange.from)
      .lte('created_at', dateRange.to),
    supabase
      .from('supplier_payments')
      .select('*')
      .gte('created_at', dateRange.from)
      .lte('created_at', dateRange.to),
    supabase.from('customers').select('*'),
    supabase.from('suppliers').select('*'),
  ]);

  const sales = (salesResult.data as Array<Sale & { customer: Customer | null }>) ?? [];
  const selectedSaleIds = new Set(sales.map((sale) => sale.id));
  const saleItems = ((saleItemsResult.data as Array<SaleItem & { variant: (ProductVariant & { product: Product | null }) | null }>) ?? [])
    .filter((item) => selectedSaleIds.has(item.sale_id));
  type ReportReturnRow = { sale_item_id: string; quantity_returned: number; return_total: number; cost_price_at_sale: number | null; return: { sale_id: string } | null };
  const returnedItems = ((returnedItemsResult.data ?? []) as unknown as ReportReturnRow[])
    .filter((item) => item.return?.sale_id && selectedSaleIds.has(item.return.sale_id))
    .map((item) => ({ ...item, sale_id: item.return!.sale_id }));
  const variants = (variantsResult.data as Array<ProductVariant & { product: Product | null }>) ?? [];
  const purchases = (purchasesResult.data as Array<Purchase & { supplier: Supplier | null }>) ?? [];
  const supplierPayments = (supplierPaymentsResult.data as SupplierPayment[]) ?? [];
  const customers = (customersResult.data as Customer[]) ?? [];
  const suppliers = (suppliersResult.data as Supplier[]) ?? [];

  const reportTotals = calculateProfitTotals(sales, saleItems, returnedItems);
  const salesAmount = reportTotals.revenue;
  const profit = reportTotals.profit;

  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const saleLineBasis = new Map<string, number>();
  for (const item of saleItems) saleLineBasis.set(item.sale_id, (saleLineBasis.get(item.sale_id) ?? 0) + Number(item.line_total ?? 0));
  const returnsByItem = new Map<string, { quantity: number; revenue: number }>();
  for (const item of returnedItems) {
    const previous = returnsByItem.get(item.sale_item_id) ?? { quantity: 0, revenue: 0 };
    returnsByItem.set(item.sale_item_id, {
      quantity: previous.quantity + Number(item.quantity_returned),
      revenue: previous.revenue + Number(item.return_total),
    });
  }

  const productSalesMap = saleItems.reduce<Record<string, { quantity: number; profit: number }>>((acc, item) => {
    const label = item.product_name_snapshot ?? item.variant?.product?.name ?? 'Unknown';
    const sale = saleById.get(item.sale_id);
    const lineBasis = saleLineBasis.get(item.sale_id) ?? 0;
    const allocatedRevenue = lineBasis > 0 ? Number(sale?.total_amount ?? 0) * Number(item.line_total ?? 0) / lineBasis : 0;
    const returned = returnsByItem.get(item.id) ?? { quantity: 0, revenue: 0 };
    const netQuantity = Math.max(Number(item.quantity) - returned.quantity, 0);
    const profitAmount = allocatedRevenue - returned.revenue - getHistoricalUnitCost(item) * netQuantity;
    acc[label] = {
      quantity: (acc[label]?.quantity ?? 0) + netQuantity,
      profit: (acc[label]?.profit ?? 0) + profitAmount,
    };
    return acc;
  }, {});

  const customerTotals = sales.reduce<Record<string, number>>((acc, sale) => {
    const label = sale.customer?.name ?? 'Walk-in Customer';
    acc[label] = (acc[label] ?? 0) + Number(sale.total_amount);
    return acc;
  }, {});

  const supplierPurchaseMap = purchases.reduce<Record<string, number>>((acc, purchase) => {
    const label = purchase.supplier?.name ?? 'Unknown Supplier';
    acc[label] = (acc[label] ?? 0) + Number(purchase.total_amount);
    return acc;
  }, {});

  const supplierPaymentMap = supplierPayments.reduce<Record<string, number>>((acc, payment) => {
    const supplier = suppliers.find((item) => item.id === payment.supplier_id);
    const label = supplier?.name ?? 'Unknown Supplier';
    acc[label] = (acc[label] ?? 0) + Number(payment.amount);
    return acc;
  }, {});

  const outstandingPayments = Object.entries(supplierPurchaseMap).map(([label, amount]) => ({
    label,
    amount: amount - (supplierPaymentMap[label] ?? 0),
  }));

  return {
    salesSummary: {
      sales: salesAmount,
      orders: sales.length,
      averageSale: sales.length ? salesAmount / sales.length : 0,
      profit,
    },
    inventorySummary: {
      currentStock: variants.reduce((sum, variant) => sum + variant.stock_quantity, 0),
      lowStock: variants.filter((variant) => variant.stock_quantity > 0 && variant.stock_quantity < 10).length,
      outOfStock: variants.filter((variant) => variant.stock_quantity <= 0).length,
      stockValue: variants.reduce((sum, variant) => sum + variant.stock_quantity * Number(variant.cost_price), 0),
    },
    productSummary: {
      bestSelling: Object.entries(productSalesMap)
        .sort((a, b) => b[1].quantity - a[1].quantity)
        .slice(0, 5)
        .map(([label, value]) => ({ label, quantity: value.quantity })),
      slowMoving: Object.entries(productSalesMap)
        .sort((a, b) => a[1].quantity - b[1].quantity)
        .slice(0, 5)
        .map(([label, value]) => ({ label, quantity: value.quantity })),
      mostProfitable: Object.entries(productSalesMap)
        .sort((a, b) => b[1].profit - a[1].profit)
        .slice(0, 5)
        .map(([label, value]) => ({ label, amount: value.profit })),
    },
    customerSummary: {
      topCustomers: Object.entries(customerTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, amount]) => ({ label, amount })),
      outstandingCustomers: customers
        .filter((customer) => Number(customer.outstanding_balance) > 0)
        .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance))
        .slice(0, 5)
        .map((customer) => ({ label: customer.name, amount: Number(customer.outstanding_balance) })),
      purchaseHistory: sales.slice(0, 10),
    },
    supplierSummary: {
      purchases: Object.entries(supplierPurchaseMap).map(([label, amount]) => ({ label, amount })),
      outstandingPayments: outstandingPayments
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    },
  };
}
