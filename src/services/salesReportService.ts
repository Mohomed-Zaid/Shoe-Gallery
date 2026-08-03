import { supabase } from './supabase';
import type { SalesReportData, SalesReportFilters } from '../types/salesReport';
import { validateSalesReportFilters } from '../utils/salesReportValidation';

export async function getSalesReport(filters: SalesReportFilters): Promise<SalesReportData> {
  validateSalesReportFilters(filters);
  const { data, error } = await supabase.rpc('get_sales_report', { p_filters: filters });
  if (error) throw error;
  return data as SalesReportData;
}

const esc = (v:unknown) => `"${String(v ?? '').replaceAll('"','""')}"`;
export function toCsv(headers:string[], rows:unknown[][]) { return [headers,...rows].map(r=>r.map(esc).join(',')).join('\r\n'); }
export function downloadBlob(name:string, content:BlobPart, type:string) { const u=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a'); a.href=u;a.download=name;a.click();URL.revokeObjectURL(u); }
export function exportWorkbook(data:SalesReportData) {
  const sheets:Array<[string,string[],unknown[][]]> = [
    ['Summary',['Metric','Value'],Object.entries(data.summary)],
    ['Invoices',['Invoice','Date','Customer','Cashier','Gross','Discounts','Returns','Net','Cost','Profit','Paid','Outstanding','Method','Type','Status'],data.invoices.map(x=>[x.invoice_number,x.created_at,x.customer_name,x.cashier_name,x.gross_amount,x.item_discount+x.invoice_discount,x.returned_amount,x.net_amount,x.cost_of_goods,x.gross_profit,x.amount_paid,x.outstanding,x.payment_method,x.sale_type,x.status])],
    ['Sale Items',['Invoice','Product','Barcode','Category','Brand','Size','Colour','Type','Sold','Returned','Net Qty','Cost','Price','Revenue','Profit'],data.invoices.flatMap(x=>x.items.map(i=>[x.invoice_number,i.product_name,i.barcode,i.category,i.brand,i.size,i.colour,i.item_type,i.quantity_sold,i.quantity_returned,i.net_quantity,i.cost_price,i.selling_price,i.net_revenue,i.profit]))],
    ...(['products','customers','cashiers','categories','brands'] as const).map(k=>[k[0].toUpperCase()+k.slice(1),['Name','Invoices','Sold','Returned','Net Qty','Gross','Discounts','Returns','Net','Paid','Outstanding','Cost','Profit','Margin'],data[k].map(x=>[x.label,x.invoices,x.quantity_sold,x.quantity_returned,x.net_quantity,x.gross_sales,x.discounts,x.returns,x.net_sales,x.amount_paid,x.outstanding,x.cost_of_goods,x.gross_profit,x.profit_margin])] as [string,string[],unknown[][]]),
    ['Payments',['Invoice','Method','Amount','Reference','Date','Received By'],data.payments.map(x=>[x.invoice_number,x.payment_method,x.amount,x.reference_number,x.payment_date,x.received_by_name])],
    ['Returns',['Invoice','Return','Date','Refund','Reason','Processed By'],data.returns.map(x=>[x.invoice_number,x.return_number,x.created_at,x.refund_amount,x.reason,x.processed_by])]
  ];
  const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.map(([n,h,rows])=>`<Worksheet ss:Name="${n}"><Table>${[h,...rows].map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="${typeof v==='number'?'Number':'String'}">${String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`).join('')}</Workbook>`;
  downloadBlob('detailed-sales-report.xls',xml,'application/vnd.ms-excel');
}
