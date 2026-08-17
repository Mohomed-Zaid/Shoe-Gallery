import { supabase } from './supabase';
import { getPurchaseById } from './purchaseService';
import type {
  PurchaseReportDetail,
  PurchaseReportExportData,
  PurchaseReportFilters,
  PurchaseReportOptions,
  PurchaseReportPageSize,
  PurchaseReportResult,
  PurchaseReportRow,
  PurchaseReportSort,
  PurchaseReportSummary,
} from '../types/purchaseReport';
import { assertUniquePurchaseReportRows } from '../utils/purchaseReportCardinality';

const emptySummary: PurchaseReportSummary = {
  total_purchase_value: 0,
  total_purchases: 0,
  total_quantity: 0,
  total_paid: 0,
  total_outstanding: 0,
  total_discounts: 0,
};
const numberValue = (value: unknown) => Number(value ?? 0);

function normalizeResult(value: unknown): PurchaseReportResult {
  const source = (value ?? {}) as Partial<PurchaseReportResult>;
  const rows = (source.rows ?? []).map((value) => {
    const row = value as PurchaseReportRow;
    return {
      ...row,
      item_lines: numberValue(row.item_lines), total_quantity: numberValue(row.total_quantity),
      subtotal: numberValue(row.subtotal), discount_amount: numberValue(row.discount_amount),
      additional_cost: numberValue(row.additional_cost), total_amount: numberValue(row.total_amount),
      paid_amount: numberValue(row.paid_amount), balance_amount: numberValue(row.balance_amount),
    };
  });
  const summary = source.summary ?? emptySummary;
  const normalized: PurchaseReportSummary = {
    total_purchase_value: numberValue(summary.total_purchase_value),
    total_purchases: numberValue(summary.total_purchases),
    total_quantity: numberValue(summary.total_quantity),
    total_paid: numberValue(summary.total_paid),
    total_outstanding: numberValue(summary.total_outstanding),
    total_discounts: numberValue(summary.total_discounts),
  };
  assertUniquePurchaseReportRows(rows);
  return { rows, total: numberValue(source.total), summary: normalized };
}

export async function getPurchaseReport(filters: PurchaseReportFilters, page = 1, pageSize: PurchaseReportPageSize = 25, sort: PurchaseReportSort = 'newest') {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) throw new Error('From date cannot be after To date.');
  const { data, error } = await supabase.rpc('get_purchase_report', {
    p_start_date: filters.startDate || null, p_end_date: filters.endDate || null,
    p_search: filters.search.trim() || null, p_supplier_id: filters.supplierId || null,
    p_payment_status: filters.paymentStatus || null, p_purchase_status: filters.purchaseStatus || null,
    p_payment_method: filters.paymentMethod || null, p_page: page, p_page_size: pageSize, p_sort: sort,
  });
  if (error) throw error;
  return normalizeResult(data);
}

export async function getPurchaseReportOptions(): Promise<PurchaseReportOptions> {
  const [suppliers, purchaseMethods, paymentMethods] = await Promise.all([
    supabase.from('suppliers').select('id,name').order('name'),
    supabase.from('purchases').select('payment_method').not('payment_method', 'is', null),
    supabase.from('supplier_payments').select('payment_method').not('payment_method', 'is', null),
  ]);
  if (suppliers.error) throw suppliers.error;
  if (purchaseMethods.error) throw purchaseMethods.error;
  if (paymentMethods.error) throw paymentMethods.error;
  const methods = new Set<string>();
  for (const row of [...(purchaseMethods.data ?? []), ...(paymentMethods.data ?? [])]) if (row.payment_method) methods.add(row.payment_method);
  return { suppliers: suppliers.data ?? [], paymentMethods: [...methods].sort() };
}

export async function getPurchaseReportDetail(id: string): Promise<PurchaseReportDetail> {
  const purchase = await getPurchaseById(id);
  return {
    purchase_id: purchase.id, purchase_number: purchase.purchase_number, purchase_date: purchase.purchase_date,
    supplier_invoice_number: purchase.supplier_invoice_number, status: purchase.status,
    created_by: purchase.created_by_email || 'Unknown', created_at: purchase.created_at,
    supplier_name: purchase.supplier?.name || 'Unknown Supplier', supplier_code: null,
    supplier_phone: purchase.supplier?.phone ?? null, supplier_address: purchase.supplier?.address ?? null,
    subtotal: numberValue(purchase.subtotal), discount_amount: numberValue(purchase.discount_amount),
    additional_cost: numberValue(purchase.additional_cost), total_amount: numberValue(purchase.total_amount),
    paid_amount: numberValue(purchase.paid_amount), balance_amount: numberValue(purchase.balance_amount),
    items: (purchase.purchase_items ?? []).map((item) => ({
      id: item.id, product_name: item.variant?.product?.name || 'Unknown Product',
      item_article: item.variant?.product?.item_article ?? null, size: item.variant?.size ?? null,
      color: item.variant?.color ?? null, barcode_number: item.variant?.barcode_number ?? null,
      quantity: numberValue(item.quantity), cost_price: numberValue(item.cost_price),
      selling_price: item.selling_price == null ? null : numberValue(item.selling_price),
      line_discount: numberValue(item.line_discount), line_total: numberValue(item.line_total),
    })),
    payments: (purchase.supplier_payments ?? []).map((payment) => {
      const recordedBy = (payment as typeof payment & { created_by?: string | null }).created_by;
      return {
        id: payment.id, payment_date: payment.payment_date, payment_method: payment.payment_method,
        amount: numberValue(payment.amount), reference_number: payment.reference_number,
        recorded_by: recordedBy || 'Unknown',
      };
    }),
  };
}

export async function getPurchaseReportExportData(filters: PurchaseReportFilters, sort: PurchaseReportSort): Promise<PurchaseReportExportData> {
  const first = await getPurchaseReport(filters, 1, 100, sort);
  const pages = Math.ceil(first.total / 100);
  const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getPurchaseReport(filters, index + 2, 100, sort))) : [];
  const rows = [first.rows, ...rest.map((result) => result.rows)].flat();
  assertUniquePurchaseReportRows(rows);
  return { ...first, rows, generatedAt: new Date().toISOString() };
}
