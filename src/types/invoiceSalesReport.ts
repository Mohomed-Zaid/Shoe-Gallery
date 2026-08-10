export type SalesReportPreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';
export type SalesReportPageSize = 25 | 50 | 100;
export type SalesReportSort = 'date_desc' | 'date_asc' | 'invoice_asc' | 'invoice_desc' | 'customer_asc' | 'customer_desc' | 'total_desc' | 'total_asc' | 'balance_desc' | 'balance_asc';

export interface InvoiceSalesReportFilters {
  startDate: string;
  endDate: string;
  search: string;
  cashierId: string;
  paymentMethod: string;
  status: string;
}

export interface InvoiceSalesReportRow {
  sale_id: string;
  invoice_number: string;
  created_at: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  cashier_id: string | null;
  cashier_name: string;
  item_lines: number;
  total_quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  payment_method: string;
  status: string;
  completed_returns: number;
  returned_quantity: number;
  returned_amount: number;
  last_return_at: string | null;
}

export interface InvoiceSalesReportSummary {
  total_sales: number;
  total_invoices: number;
  items_sold: number;
  total_discounts: number;
  total_received: number;
  outstanding: number;
}

export interface InvoiceSalesReportResult {
  rows: InvoiceSalesReportRow[];
  count: number;
  summary: InvoiceSalesReportSummary;
}

export interface InvoiceSalesReportOptions {
  cashiers: Array<{ id: string; name: string }>;
}

export interface InvoiceDetailItem {
  id: string;
  product: string;
  itemNumber: string;
  itemArticle: string;
  barcode: string;
  size: string;
  colour: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  historicalCost: number | null;
}

export interface InvoiceDetailReturn {
  id: string;
  product: string;
  size: string;
  colour: string;
  quantity: number;
  amount: number;
  returnedAt: string;
}

export interface InvoiceSalesReportDetail {
  sale: {
    sale_id: string;
    invoice_number: string;
    created_at: string;
    cashier_name: string;
    customer_name: string;
    customer_phone: string | null;
    payment_method: string;
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    balance: number;
    change: number;
  };
  items: InvoiceDetailItem[];
  returns: InvoiceDetailReturn[];
}

export interface InvoiceSalesReportExportData {
  rows: InvoiceSalesReportRow[];
  summary: InvoiceSalesReportSummary;
  store: { store_name: string; address: string | null; phone: string | null };
  generatedAt: string;
}
