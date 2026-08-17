import { supabase } from './supabase';
import { getProductInventoryMatrix } from './inventoryService';
import type { ProductVariant } from '../types';
import type { InventoryReportDetail, InventoryReportExportData, InventoryReportFilters, InventoryReportOptions, InventoryReportPageSize, InventoryReportResult, InventoryReportRow, InventoryReportSort, InventoryReportSummary, InventoryReportVariant, InventoryStockStatus } from '../types/inventoryReport';
import { assertUniqueInventoryReportRows } from '../utils/inventoryReportCardinality';
import { compareProductVariants } from '../utils/variantSorting';

const emptySummary: InventoryReportSummary = { total_products: 0, total_variants: 0, total_stock: 0, cost_value: 0, selling_value: 0, potential_profit: 0, low_stock_variants: 0, out_of_stock_variants: 0, missing_cost: 0, missing_selling: 0, missing_barcode: 0, negative_stock: 0, low_stock_threshold: 10 };
const numberValue = (value: unknown) => Number(value ?? 0);
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);

function normalizeResult(value: unknown): InventoryReportResult {
  const source = (value ?? {}) as Partial<InventoryReportResult>;
  const rows = (source.rows ?? []).map((value) => { const row = value as InventoryReportRow; return { ...row, variant_count: numberValue(row.variant_count), total_stock: numberValue(row.total_stock), min_cost: nullableNumber(row.min_cost), max_cost: nullableNumber(row.max_cost), min_selling: nullableNumber(row.min_selling), max_selling: nullableNumber(row.max_selling), cost_value: numberValue(row.cost_value), selling_value: numberValue(row.selling_value), potential_profit: numberValue(row.potential_profit), low_stock_count: numberValue(row.low_stock_count), out_of_stock_count: numberValue(row.out_of_stock_count), negative_stock_count: numberValue(row.negative_stock_count), missing_cost_count: numberValue(row.missing_cost_count), missing_selling_count: numberValue(row.missing_selling_count), missing_barcode_count: numberValue(row.missing_barcode_count) }; });
  const s = source.summary ?? emptySummary;
  const summary: InventoryReportSummary = { total_products: numberValue(s.total_products), total_variants: numberValue(s.total_variants), total_stock: numberValue(s.total_stock), cost_value: numberValue(s.cost_value), selling_value: numberValue(s.selling_value), potential_profit: numberValue(s.potential_profit), low_stock_variants: numberValue(s.low_stock_variants), out_of_stock_variants: numberValue(s.out_of_stock_variants), missing_cost: numberValue(s.missing_cost), missing_selling: numberValue(s.missing_selling), missing_barcode: numberValue(s.missing_barcode), negative_stock: numberValue(s.negative_stock), low_stock_threshold: numberValue(s.low_stock_threshold) || 10 };
  assertUniqueInventoryReportRows(rows);
  return { rows, total: numberValue(source.total), summary };
}

export async function getInventoryReport(filters: InventoryReportFilters, page = 1, pageSize: InventoryReportPageSize = 25, sort: InventoryReportSort = 'product_asc') {
  const { data, error } = await supabase.rpc('get_inventory_report', { p_search: filters.search.trim() || null, p_category_id: filters.categoryId || null, p_brand_id: filters.brandId || null, p_stock_status: filters.stockStatus || null, p_page: page, p_page_size: pageSize, p_sort: sort });
  if (error) throw error;
  return normalizeResult(data);
}

export async function getInventoryReportOptions(): Promise<InventoryReportOptions> {
  const [categories, brands] = await Promise.all([supabase.from('categories').select('id,name').order('name'), supabase.from('brands').select('id,name').order('name')]);
  if (categories.error) throw categories.error; if (brands.error) throw brands.error;
  return { categories: categories.data ?? [], brands: brands.data ?? [] };
}

function stockStatus(stock: number, threshold: number): InventoryStockStatus {
  if (stock < 0) return 'negative_stock'; if (stock === 0) return 'out_of_stock'; if (stock < threshold) return 'low_stock'; return 'in_stock';
}

export async function getInventoryReportDetail(product: InventoryReportRow, threshold: number): Promise<InventoryReportDetail> {
  const result = await getProductInventoryMatrix(product.product_id);
  if (result.error || !result.data) throw result.error || new Error('Product not found.');
  const variants = [...result.data.variants].sort(compareProductVariants).map((variant) => variantRow(variant, product.product_name, product.item_article, threshold));
  return { product, variants };
}

function variantRow(variant: ProductVariant, productName: string, article: string | null, threshold: number): InventoryReportVariant {
  const stock = numberValue(variant.stock_quantity); const cost = nullableNumber(variant.cost_price); const selling = nullableNumber(variant.selling_price);
  return { id: variant.id, product_id: variant.product_id, product_name: productName, item_article: article, size: variant.size, color: variant.color, barcode_number: variant.barcode_number, stock_quantity: stock, cost_price: cost, selling_price: selling, cost_value: cost === null ? null : stock * cost, selling_value: selling === null ? null : stock * selling, stock_status: stockStatus(stock, threshold) };
}

async function allRows(filters: InventoryReportFilters, sort: InventoryReportSort) {
  const first = await getInventoryReport(filters, 1, 100, sort); const pages = Math.ceil(first.total / 100);
  const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getInventoryReport(filters, index + 2, 100, sort))) : [];
  const rows = [first.rows, ...rest.map((value) => value.rows)].flat(); assertUniqueInventoryReportRows(rows); return { ...first, rows };
}

export async function getInventoryReportExportData(filters: InventoryReportFilters, sort: InventoryReportSort): Promise<InventoryReportExportData> {
  const report = await allRows(filters, sort); const ids = report.rows.map((row) => row.product_id);
  if (!ids.length) return { ...report, variants: [], generatedAt: new Date().toISOString() };
  const { data, error } = await supabase.from('product_variants').select('*,product:products(name,item_article)').in('product_id', ids).or('is_active.eq.true,is_active.is.null');
  if (error) throw error;
  const rowById = new Map(report.rows.map((row) => [row.product_id, row]));
  const variants = (data ?? []).map((raw) => { const row = rowById.get(raw.product_id); return variantRow(raw as unknown as ProductVariant, row?.product_name || 'Unknown Product', row?.item_article ?? null, report.summary.low_stock_threshold); }).sort((a, b) => a.product_name.localeCompare(b.product_name) || compareProductVariants(a as unknown as ProductVariant, b as unknown as ProductVariant));
  return { ...report, variants, generatedAt: new Date().toISOString() };
}
