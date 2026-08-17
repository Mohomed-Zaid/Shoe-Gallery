export type CashupPreset='today'|'yesterday'|'last_7_days'|'this_month'|'last_month'|'all_time'|'custom';export type CashupPageSize=25|50|100;export type CashupSort='newest'|'oldest'|'sales_desc'|'difference_asc'|'cashier_asc';
export interface CashupFilters{startDate:string;endDate:string;search:string;cashierId:string;status:string}
export interface CashupRow{session_id:string;cashup_number:string;user_id:string;cashier_name:string;opening_time:string;closing_time:string|null;opening_cash:number;total_invoices:number;items_sold:number;gross_sales:number;discounts:number;total_sales:number;cash_sales:number;card_sales:number;bank_sales:number;credit_sales:number;other_sales:number;cash_refunds:number;cash_expenses:number;expected_cash:number;counted_cash:number|null;difference:number|null;status:'open'|'closed';difference_status:'open'|'balanced'|'short'|'over';notes:string|null}
export interface CashupSummary{sessions:number;total_sales:number;cash_sales:number;card_sales:number;bank_sales:number;credit_sales:number;expected_cash:number;cash_difference:number}
export interface DailyCashup{date:string;sessions:number;sales:number;cash:number;card:number;transfer:number;credit:number;expected_cash:number;counted_cash:number;difference:number}
export interface CashierCashup{name:string;sessions:number;invoices:number;sales:number;cash_collected:number;difference:number}
export interface CashupResult{rows:CashupRow[];total:number;summary:CashupSummary;daily:DailyCashup[];cashiers:CashierCashup[]}
export interface CashupOptions{cashiers:Array<{id:string;name:string}>}
export interface CashupSale{id:string;invoice_number:string;created_at:string;customer_name:string;payment:string;total:number;cashier:string;status:string;items:number;quantity:number;gross:number;discount:number}
export interface CashupRefund{id:string;return_number:string;invoice:string;date:string;method:string;amount:number;processed_by:string}
export interface CashupExpense{id:string;date:string;description:string;amount:number;user:string}
export interface CashupDetail{session:CashupRow;sales:CashupSale[];refunds:CashupRefund[];expenses:CashupExpense[]}
export interface CashupExportData extends CashupResult{details:CashupDetail[];generatedAt:string}
