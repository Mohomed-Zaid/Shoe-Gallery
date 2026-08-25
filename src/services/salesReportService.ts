import { supabase } from './supabase';
import type {
  ReportPageSize,
  ReportSort,
  SalesReportExportData,
  SalesReportFilterOptions,
  SalesReportFilters,
  SalesReportResult,
  SalesReportRow,
  SalesReportStore,
  SalesReportSummary,
} from '../types/salesReport';
import { assertUniqueSalesReportRows } from '../utils/salesReportCardinality';
import { validateSalesReportFilters } from '../utils/salesReportValidation';

const emptySummary: SalesReportSummary = {
  total_sales: 0,
  total_invoices: 0,
  total_quantity: 0,
  total_received: 0,
  total_outstanding: 0,
  total_discounts: 0,
  total_gross_card_amount: 0,
  total_card_processing_fees: 0,
  total_net_card_amount: 0,
};

const numberValue = (value: unknown) => Number(value ?? 0);

function normalizeResult(value: unknown): SalesReportResult {
  const source = (value ?? {}) as Partial<SalesReportResult>;
  const rows = (source.rows ?? []).map((row) => {
    const item = row as SalesReportRow;
    return {
      ...item,
      item_count: numberValue(item.item_count),
      total_quantity: numberValue(item.total_quantity),
      subtotal: numberValue(item.subtotal),
      discount: numberValue(item.discount),
      selling_price: numberValue(item.selling_price),
      gross_card_amount: numberValue(item.gross_card_amount),
      card_processing_fee: numberValue(item.card_processing_fee),
      net_card_amount: numberValue(item.net_card_amount),
      total: numberValue(item.total),
      amount_paid: numberValue(item.amount_paid),
      balance: numberValue(item.balance),
    };
  });
  const summarySource = source.summary ?? emptySummary;
  const summary: SalesReportSummary = {
    total_sales: numberValue(summarySource.total_sales),
    total_invoices: numberValue(summarySource.total_invoices),
    total_quantity: numberValue(summarySource.total_quantity),
    total_received: numberValue(summarySource.total_received),
    total_outstanding: numberValue(summarySource.total_outstanding),
    total_discounts: numberValue(summarySource.total_discounts),
    total_gross_card_amount: numberValue(summarySource.total_gross_card_amount),
    total_card_processing_fees: numberValue(summarySource.total_card_processing_fees),
    total_net_card_amount: numberValue(summarySource.total_net_card_amount),
  };
  assertUniqueSalesReportRows(rows);
  return { rows, total: numberValue(source.total), summary };
}

function reportArgs(
  filters: SalesReportFilters,
  page: number,
  pageSize: number,
  sort: ReportSort,
) {
  return {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_invoice_number: filters.invoiceNumber.trim() || null,
    p_customer_id: filters.customerId || null,
    p_cashier_id: filters.cashierId || null,
    p_payment_method: filters.paymentMethod || null,
    p_status: filters.status || null,
    p_page: page,
    p_page_size: pageSize,
    p_sort: sort,
  };
}

export async function getSimpleSalesReport(
  filters: SalesReportFilters,
  page = 1,
  pageSize: ReportPageSize | 100 = 25,
  sort: ReportSort = 'newest',
): Promise<SalesReportResult> {
  validateSalesReportFilters(filters);
  const { data, error } = await supabase.rpc(
    'get_simple_sales_report',
    reportArgs(filters, page, pageSize, sort),
  );
  if (error) throw error;
  return normalizeResult(data);
}

export async function getSalesReportFilterOptions(): Promise<SalesReportFilterOptions> {
  const [customersResult, cashiersResult] = await Promise.all([
    supabase.from('customers').select('id,name').order('name'),
    supabase.from('profiles').select('id,full_name,email').order('full_name'),
  ]);
  if (customersResult.error) throw customersResult.error;
  if (cashiersResult.error) throw cashiersResult.error;
  return {
    customers: (customersResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    cashiers: (cashiersResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.full_name || row.email || 'Unknown',
    })),
  };
}

async function getAllRows(filters: SalesReportFilters, sort: ReportSort) {
  const first = await getSimpleSalesReport(filters, 1, 100, sort);
  const pages = Math.ceil(first.total / 100);
  if (pages <= 1) return first;
  const remaining = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      getSimpleSalesReport(filters, index + 2, 100, sort),
    ),
  );
  const rows = [first.rows, ...remaining.map((result) => result.rows)].flat();
  assertUniqueSalesReportRows(rows);
  return { ...first, rows };
}

export async function getSalesReportExportData(
  filters: SalesReportFilters,
  sort: ReportSort,
): Promise<SalesReportExportData> {
  const [report, storeResult] = await Promise.all([
    getAllRows(filters, sort),
    supabase.from('store_settings').select('store_name,address,phone').limit(1).maybeSingle(),
  ]);
  if (storeResult.error) throw storeResult.error;
  const store = (storeResult.data ?? {
    store_name: 'Shoe Gallery',
    address: null,
    phone: null,
  }) as SalesReportStore;
  return { rows: report.rows, summary: report.summary, store, generatedAt: new Date().toISOString() };
}

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function exportRows(rows: SalesReportRow[]) {
  return rows.map((row) => [
    row.invoice_number,
    new Date(row.created_at).toLocaleDateString(),
    new Date(row.created_at).toLocaleTimeString(),
    row.customer_name,
    row.cashier_name,
    row.item_count,
    row.total_quantity,
    row.subtotal,
    row.discount,
    row.selling_price,
    row.gross_card_amount,
    row.card_processing_fee,
    row.net_card_amount,
    row.total,
    row.amount_paid,
    row.balance,
    formatPaymentMethod(row.payment_method),
    formatStatus(row.status),
  ]);
}

const headers = [
  'Invoice', 'Date', 'Time', 'Customer', 'Cashier', 'Items', 'Quantity',
  'Subtotal', 'Discount', 'Selling Price', 'Gross Card Amount', 'Card Fee (2.75%)', 'Net Card Amount', 'Total', 'Paid', 'Balance', 'Payment Method', 'Status',
];

export function downloadBlob(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSimpleSalesReportCsv(data: SalesReportExportData) {
  const csv = [headers, ...exportRows(data.rows)]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
  downloadBlob('sales-report.csv', csv, 'text/csv;charset=utf-8');
}

const xmlText = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

export function exportSimpleSalesReportExcel(data: SalesReportExportData) {
  const tableRows = [headers, ...exportRows(data.rows)].map((row) =>
    `<Row>${row.map((value) => `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xmlText(value)}</Data></Cell>`).join('')}</Row>`,
  ).join('');
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sales Report"><Table>${tableRows}</Table></Worksheet></Workbook>`;
  downloadBlob('sales-report.xls', xml, 'application/vnd.ms-excel');
}

export function formatPaymentMethod(value: string) {
  if (value === 'split_payment') return 'Split Payment';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
