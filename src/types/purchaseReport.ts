import type { PurchasePaymentStatus, PurchaseStatus } from './purchase';

export type PurchaseReportPreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';
export type PurchaseReportSort = 'newest' | 'oldest' | 'number_asc' | 'number_desc' | 'supplier_asc' | 'total_desc' | 'total_asc' | 'balance_desc' | 'balance_asc';
export type PurchaseReportPageSize = 25 | 50 | 100;

export interface PurchaseReportFilters {
  startDate: string;
  endDate: string;
  search: string;
  supplierId: string;
  paymentStatus: string;
  purchaseStatus: string;
  paymentMethod: string;
}

export interface PurchaseReportRow {
  purchase_id: string;
  purchase_number: string;
  purchase_date: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_invoice_number: string | null;
  item_lines: number;
  total_quantity: number;
  subtotal: number;
  discount_amount: number;
  additional_cost: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: PurchasePaymentStatus;
  status: PurchaseStatus;
  payment_method: string | null;
  created_by: string;
  created_at: string;
}

export interface PurchaseReportSummary {
  total_purchase_value: number;
  total_purchases: number;
  total_quantity: number;
  total_paid: number;
  total_outstanding: number;
  total_discounts: number;
}

export interface PurchaseReportResult {
  rows: PurchaseReportRow[];
  total: number;
  summary: PurchaseReportSummary;
}

export interface PurchaseReportOptions {
  suppliers: Array<{ id: string; name: string }>;
  paymentMethods: string[];
}

export interface PurchaseReportDetailItem {
  id: string;
  product_name: string;
  item_article: string | null;
  size: string | null;
  color: string | null;
  barcode_number: string | null;
  quantity: number;
  cost_price: number;
  selling_price: number | null;
  line_discount: number;
  line_total: number;
}

export interface PurchaseReportPayment {
  id: string;
  payment_date: string;
  payment_method: string;
  amount: number;
  reference_number: string | null;
  recorded_by: string;
}

export interface PurchaseReportDetail {
  purchase_id: string;
  purchase_number: string;
  purchase_date: string;
  supplier_invoice_number: string | null;
  status: PurchaseStatus;
  created_by: string;
  created_at: string;
  supplier_name: string;
  supplier_code: string | null;
  supplier_phone: string | null;
  supplier_address: string | null;
  subtotal: number;
  discount_amount: number;
  additional_cost: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  items: PurchaseReportDetailItem[];
  payments: PurchaseReportPayment[];
}

export interface PurchaseReportExportData extends PurchaseReportResult {
  generatedAt: string;
}
