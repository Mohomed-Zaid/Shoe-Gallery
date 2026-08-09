import { supabase } from './supabase';
import type {
  InvoiceDetailItem,
  InvoiceDetailReturn,
  InvoiceSalesReportDetail,
  InvoiceSalesReportExportData,
  InvoiceSalesReportFilters,
  InvoiceSalesReportOptions,
  InvoiceSalesReportResult,
  InvoiceSalesReportRow,
  InvoiceSalesReportSummary,
  SalesReportPageSize,
  SalesReportPreset,
  SalesReportSort,
} from '../types/invoiceSalesReport';

const emptySummary: InvoiceSalesReportSummary = {
  total_sales: 0,
  total_invoices: 0,
  items_sold: 0,
  total_discounts: 0,
  total_received: 0,
  outstanding: 0,
};

const numberValue = (value: unknown) => Number(value ?? 0);

function validateUniqueInvoiceRows(rows: InvoiceSalesReportRow[]) {
  const ids = rows.map((row) => row.sale_id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    console.error('Sales Report contains duplicate invoices');
    throw new Error('Invoice-level report validation failed.');
  }
}

function normalizeResult(value: unknown): InvoiceSalesReportResult {
  const source = (value ?? {}) as Partial<InvoiceSalesReportResult>;
  const rows = (source.rows ?? []).map((raw) => ({
    ...raw,
    item_lines: numberValue(raw.item_lines),
    total_quantity: numberValue(raw.total_quantity),
    subtotal: numberValue(raw.subtotal),
    discount: numberValue(raw.discount),
    total: numberValue(raw.total),
    paid: numberValue(raw.paid),
    balance: numberValue(raw.balance),
    completed_returns: numberValue(raw.completed_returns),
    returned_quantity: numberValue(raw.returned_quantity),
    returned_amount: numberValue(raw.returned_amount),
  })) as InvoiceSalesReportRow[];
  validateUniqueInvoiceRows(rows);
  const summarySource = source.summary ?? emptySummary;
  return {
    rows,
    count: numberValue(source.count),
    summary: {
      total_sales: numberValue(summarySource.total_sales),
      total_invoices: numberValue(summarySource.total_invoices),
      items_sold: numberValue(summarySource.items_sold),
      total_discounts: numberValue(summarySource.total_discounts),
      total_received: numberValue(summarySource.total_received),
      outstanding: numberValue(summarySource.outstanding),
    },
  };
}

function reportArguments(filters: InvoiceSalesReportFilters, page: number, pageSize: number, sort: SalesReportSort) {
  return {
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_search: filters.search.trim() || null,
    p_cashier_id: filters.cashierId || null,
    p_payment_method: filters.paymentMethod || null,
    p_status: filters.status || null,
    p_page: page,
    p_page_size: pageSize,
    p_sort: sort,
  };
}

export async function getInvoiceSalesReport(
  filters: InvoiceSalesReportFilters,
  page = 1,
  pageSize: SalesReportPageSize | 100 = 25,
  sort: SalesReportSort = 'date_desc',
) {
  const { data, error } = await supabase.rpc('get_invoice_sales_report_v2', reportArguments(filters, page, pageSize, sort));
  if (error) throw error;
  return normalizeResult(data);
}

export async function getInvoiceSalesReportOptions(): Promise<InvoiceSalesReportOptions> {
  const { data, error } = await supabase.from('profiles').select('id,full_name,email').order('full_name');
  if (error) throw error;
  return {
    cashiers: (data ?? []).map((row) => ({ id: row.id, name: row.full_name || row.email || 'Unknown' })),
  };
}

export function getPresetDates(preset: SalesReportPreset, now = new Date()) {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const format = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  if (preset === 'all_time') return { startDate: '', endDate: '' };
  if (preset === 'yesterday') {
    const date = new Date(local); date.setDate(date.getDate() - 1);
    return { startDate: format(date), endDate: format(date) };
  }
  if (preset === 'last_7_days') {
    const start = new Date(local); start.setDate(start.getDate() - 6);
    return { startDate: format(start), endDate: format(local) };
  }
  if (preset === 'this_month') return { startDate: format(new Date(local.getFullYear(), local.getMonth(), 1)), endDate: format(local) };
  if (preset === 'last_month') {
    return {
      startDate: format(new Date(local.getFullYear(), local.getMonth() - 1, 1)),
      endDate: format(new Date(local.getFullYear(), local.getMonth(), 0)),
    };
  }
  return { startDate: format(local), endDate: format(local) };
}

export function formatReportPeriod(filters: Pick<InvoiceSalesReportFilters, 'startDate' | 'endDate'>) {
  if (!filters.startDate && !filters.endDate) return 'All Time';
  const display = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${display(filters.startDate)} - ${display(filters.endDate)}`;
}

export async function getInvoiceSalesReportDetail(saleId: string): Promise<InvoiceSalesReportDetail> {
  const [saleResult, itemsResult, paymentsResult, returnsResult] = await Promise.all([
    supabase.from('sales').select('id,invoice_number,created_at,subtotal,discount_amount,total_amount,paid_amount,balance_due,change_due,payment_method,customer:customers(name,phone),cashier:profiles(full_name,email)').eq('id', saleId).single(),
    supabase.from('sale_items').select('id,quantity,selling_price,discount_amount,line_total,product_name_snapshot,item_number_snapshot,barcode_number_snapshot,size_snapshot,color_snapshot,cost_price_at_sale,variant:product_variants(barcode_number,size,color,product:products(name,item_number))').eq('sale_id', saleId),
    supabase.from('sale_payments').select('payment_method,amount').eq('sale_id', saleId),
    supabase.from('sales_returns').select('id,return_date,status,sales_return_items(id,product_name,size,colour,quantity_returned,return_total)').eq('sale_id', saleId).eq('status', 'completed').order('return_date'),
  ]);
  if (saleResult.error) throw saleResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (returnsResult.error) throw returnsResult.error;

  const sale = saleResult.data as unknown as {
    id: string; invoice_number: string | null; created_at: string; subtotal: number; discount_amount: number;
    total_amount: number; paid_amount: number; balance_due: number; change_due: number; payment_method: string;
    customer: { name: string; phone: string | null } | null; cashier: { full_name: string | null; email: string | null } | null;
  };
  const paymentRows = paymentsResult.data ?? [];
  const paid = paymentRows.length ? paymentRows.reduce((sum, payment) => sum + Number(payment.amount), 0) : Number(sale.paid_amount ?? 0);
  const methods = new Set(paymentRows.map((payment) => payment.payment_method));
  const paymentMethod = methods.size > 1 ? 'split' : paymentRows[0]?.payment_method || sale.payment_method;

  const items = (itemsResult.data ?? []).map((raw) => {
    const item = raw as unknown as {
      id: string; quantity: number; selling_price: number; discount_amount: number; line_total: number;
      product_name_snapshot: string | null; item_number_snapshot: string | null; barcode_number_snapshot: string | null;
      size_snapshot: string | null; color_snapshot: string | null; cost_price_at_sale: number | null;
      variant: { barcode_number: string | null; size: string; color: string; product: { name: string; item_number: string | null } | null } | null;
    };
    return {
      id: item.id,
      product: item.product_name_snapshot || item.variant?.product?.name || 'Instant item',
      itemNumber: item.item_number_snapshot || item.variant?.product?.item_number || '—',
      barcode: item.barcode_number_snapshot || item.variant?.barcode_number || '—',
      size: item.size_snapshot || item.variant?.size || '—',
      colour: item.color_snapshot || item.variant?.color || '—',
      quantity: Number(item.quantity),
      unitPrice: Number(item.selling_price),
      discount: Number(item.discount_amount ?? 0),
      total: Number(item.line_total ?? Number(item.selling_price) * Number(item.quantity)),
      historicalCost: item.cost_price_at_sale == null ? null : Number(item.cost_price_at_sale),
    } satisfies InvoiceDetailItem;
  });

  const returns = (returnsResult.data ?? []).flatMap((header) =>
    (header.sales_return_items ?? []).map((raw) => ({
      id: raw.id,
      product: raw.product_name,
      size: raw.size || '—',
      colour: raw.colour || '—',
      quantity: Number(raw.quantity_returned),
      amount: Number(raw.return_total),
      returnedAt: header.return_date,
    } satisfies InvoiceDetailReturn)),
  );

  return {
    sale: {
      sale_id: sale.id,
      invoice_number: sale.invoice_number || sale.id,
      created_at: sale.created_at,
      cashier_name: sale.cashier?.full_name || sale.cashier?.email || 'Unknown',
      customer_name: sale.customer?.name || 'Walk-in Customer',
      customer_phone: sale.customer?.phone || null,
      payment_method: paymentMethod,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount_amount),
      total: Number(sale.total_amount),
      paid,
      balance: Math.max(Number(sale.total_amount) - paid, 0),
      change: Number(sale.change_due ?? 0),
    },
    items,
    returns,
  };
}

export async function getInvoiceSalesReportExportData(filters: InvoiceSalesReportFilters, sort: SalesReportSort): Promise<InvoiceSalesReportExportData> {
  const first = await getInvoiceSalesReport(filters, 1, 100, sort);
  const pageCount = Math.ceil(first.count / 100);
  const remaining = pageCount > 1
    ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => getInvoiceSalesReport(filters, index + 2, 100, sort)))
    : [];
  const rows = [first.rows, ...remaining.map((page) => page.rows)].flat();
  validateUniqueInvoiceRows(rows);
  const { data: store, error } = await supabase.from('store_settings').select('store_name,address,phone').limit(1).maybeSingle();
  if (error) throw error;
  return {
    rows,
    summary: first.summary,
    store: store ?? { store_name: 'SHOE GALLERY', address: null, phone: null },
    generatedAt: new Date().toISOString(),
  };
}

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const exportHeaders = ['Invoice Number', 'Date', 'Time', 'Customer', 'Cashier', 'Quantity', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Payment Method', 'Status'];
const exportRows = (rows: InvoiceSalesReportRow[]) => rows.map((row) => {
  const created = new Date(row.created_at);
  return [row.invoice_number, created.toLocaleDateString(), created.toLocaleTimeString(), row.customer_name, row.cashier_name, row.total_quantity, row.subtotal, row.discount, row.total, row.paid, row.balance, formatPaymentMethod(row.payment_method), formatSaleStatus(row.status)];
});

function download(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export function exportInvoiceSalesReportCsv(data: InvoiceSalesReportExportData) {
  download('sales-report.csv', [exportHeaders, ...exportRows(data.rows)].map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

const xmlText = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function exportInvoiceSalesReportExcel(data: InvoiceSalesReportExportData) {
  const rows = [exportHeaders, ...exportRows(data.rows)].map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xmlText(cell)}</Data></Cell>`).join('')}</Row>`).join('');
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sales Report"><Table>${rows}</Table></Worksheet></Workbook>`;
  download('sales-report.xls', workbook, 'application/vnd.ms-excel');
}

export function formatPaymentMethod(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatSaleStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
