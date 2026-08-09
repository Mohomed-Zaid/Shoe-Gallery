export type ReportPreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom';
export type ReportPageSize = 25 | 50 | 100;
export type ReportSort =
  | 'newest'
  | 'oldest'
  | 'invoice_asc'
  | 'invoice_desc'
  | 'total_asc'
  | 'total_desc'
  | 'customer_asc';

export interface SalesReportFilters {
  startDate: string;
  endDate: string;
  invoiceNumber: string;
  customerId: string;
  cashierId: string;
  paymentMethod: string;
  status: string;
}

export interface SalesReportRow {
  id: string;
  invoice_number: string;
  created_at: string;
  customer_id: string | null;
  customer_name: string;
  cashier_id: string | null;
  cashier_name: string;
  item_count: number;
  total_quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  balance: number;
  payment_method: string;
  status: string;
}

export interface SalesReportSummary {
  total_sales: number;
  total_invoices: number;
  total_quantity: number;
  total_received: number;
  total_outstanding: number;
  total_discounts: number;
}

export interface SalesReportResult {
  rows: SalesReportRow[];
  total: number;
  summary: SalesReportSummary;
}

export interface SalesReportFilterOptions {
  customers: Array<{ id: string; name: string }>;
  cashiers: Array<{ id: string; name: string }>;
}

export interface SalesReportStore {
  store_name: string;
  address: string | null;
  phone: string | null;
}

export interface SalesReportExportData {
  rows: SalesReportRow[];
  summary: SalesReportSummary;
  store: SalesReportStore;
  generatedAt: string;
}
