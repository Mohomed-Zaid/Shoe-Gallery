import type { SalesReturnStatus, SalesReturnType } from './salesReturn';

export type ReturnsReportPreset = 'today'|'yesterday'|'last_7_days'|'this_month'|'last_month'|'all_time'|'custom';
export type ReturnsReportSort = 'newest'|'oldest'|'number_asc'|'number_desc'|'invoice_asc'|'value_desc'|'value_asc'|'customer_asc'|'status_asc';
export type ReturnsReportPageSize = 25|50|100;
export interface ReturnsReportFilters { startDate:string; endDate:string; search:string; returnType:string; status:string; customerId:string; processorId:string; restockStatus:string; }
export interface ReturnsReportRow { return_id:string;return_number:string;return_date:string;sale_id:string;original_invoice:string;invoice_date:string;customer_id:string|null;customer_name:string;customer_phone:string|null;return_type:SalesReturnType;item_lines:number;returned_quantity:number;return_value:number;refunded_amount:number;exchange_value:number;restocked_quantity:number;non_restocked_quantity:number;processed_by_id:string|null;processed_by:string;status:SalesReturnStatus;reason:string;created_at:string;original_total:number;payment_method:string;refund_method:string|null;refund_reference:string|null;replacement_sale_id:string|null;replacement_invoice:string|null;additional_payment:number;store_credit_amount:number; }
export interface ReturnsReportSummary { total_returns:number;return_transactions:number;quantity_returned:number;return_value:number;refunded_amount:number;exchange_value:number;restocked_quantity:number;non_restocked_quantity:number; }
export interface ReturnedProductSummary { product_name:string;article:string|null;returned_quantity:number;return_value:number; }
export interface ReturnReasonSummary { reason:string;transactions:number; }
export interface ReturnsReportResult { rows:ReturnsReportRow[];total:number;summary:ReturnsReportSummary;products:ReturnedProductSummary[];reasons:ReturnReasonSummary[]; }
export interface ReturnsReportOptions { customers:Array<{id:string;name:string}>;processors:Array<{id:string;name:string}>; }
export interface ReturnsReportItem { id:string;return_id:string;return_number:string;original_invoice:string;product_name:string;article:string|null;size:string|null;colour:string|null;barcode_number:string|null;original_quantity:number;quantity_returned:number;selling_price_at_sale:number;return_amount:number;restocked:boolean;reason:string;condition:string|null;cost_price_at_sale:number|null; }
export interface ReturnsReportRefund { id:string;date:string;method:string;amount:number;reference:string|null;refunded_by:string; }
export interface ReturnsReportDetail { header:ReturnsReportRow;items:ReturnsReportItem[];refunds:ReturnsReportRefund[]; }
export interface ReturnsReportExportData extends ReturnsReportResult { items:ReturnsReportItem[];generatedAt:string; }
