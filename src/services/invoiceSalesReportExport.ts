import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceSalesReportExportData, InvoiceSalesReportFilters } from '../types/invoiceSalesReport';
import { formatPaymentMethod, formatReportPeriod, formatSaleStatus } from './invoiceSalesReportService';

const money = (value: number) => `Rs. ${Number(value).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => new Date(value).toLocaleDateString('en-GB');
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function exportInvoiceSalesReportPdf(data: InvoiceSalesReportExportData, filters: InvoiceSalesReportFilters) {
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = document.internal.pageSize.getWidth();
  document.setFillColor(5, 28, 21);
  document.rect(0, 0, pageWidth, 29, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.text((data.store.store_name || 'SHOE GALLERY').toUpperCase(), 12, 10);
  document.setFontSize(11);
  document.text('Sales Report', 12, 18);
  document.setFont('helvetica', 'normal');
  document.setFontSize(8);
  document.text(`Date Range: ${formatReportPeriod(filters)}`, pageWidth - 12, 10, { align: 'right' });
  document.text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, pageWidth - 12, 17, { align: 'right' });

  const summary = data.summary;
  autoTable(document, {
    startY: 34,
    theme: 'grid',
    margin: { left: 10, right: 10 },
    head: [['Total Sales', 'Invoices', 'Items Sold', 'Discounts', 'Received', 'Outstanding']],
    body: [[money(summary.total_sales), summary.total_invoices, summary.items_sold, money(summary.total_discounts), money(summary.total_received), money(summary.outstanding)]],
    styles: { fontSize: 8, cellPadding: 2, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.15 },
    headStyles: { fillColor: [9, 78, 59], textColor: [255, 255, 255] },
  });

  const tableY = ((document as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 48) + 6;
  autoTable(document, {
    startY: tableY,
    theme: 'grid',
    margin: { left: 7, right: 7, bottom: 13 },
    head: [['Invoice', 'Date', 'Customer', 'Cashier', 'Qty', 'Discount', 'Total', 'Paid', 'Balance', 'Payment', 'Status']],
    body: data.rows.map((row) => [row.invoice_number, date(row.created_at), row.customer_name, row.cashier_name, row.total_quantity, money(row.discount), money(row.total), money(row.paid), money(row.balance), formatPaymentMethod(row.payment_method), formatSaleStatus(row.status)]),
    styles: { fontSize: 7, cellPadding: 1.4, textColor: [15, 23, 42], lineColor: [203, 213, 225], lineWidth: 0.12 },
    headStyles: { fillColor: [5, 28, 21], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    didDrawPage: () => {
      const height = document.internal.pageSize.getHeight();
      document.setTextColor(71, 85, 105);
      document.setFontSize(7);
      document.text(`Page ${document.getCurrentPageInfo().pageNumber}`, pageWidth - 10, height - 4, { align: 'right' });
    },
  });
  document.save('sales-report.pdf');
}

export function printInvoiceSalesReport(data: InvoiceSalesReportExportData, filters: InvoiceSalesReportFilters) {
  const popup = window.open('', 'sales-report-print', 'popup=yes,width=1200,height=800,scrollbars=yes,resizable=yes');
  if (!popup) throw new Error('Print window was blocked.');
  const summary = data.summary;
  const rows = data.rows.map((row) => `<tr><td>${escapeHtml(row.invoice_number)}</td><td>${escapeHtml(date(row.created_at))}</td><td>${escapeHtml(row.customer_name)}</td><td>${escapeHtml(row.cashier_name)}</td><td class="number">${row.total_quantity}</td><td class="number">${escapeHtml(money(row.discount))}</td><td class="number">${escapeHtml(money(row.total))}</td><td class="number">${escapeHtml(money(row.paid))}</td><td class="number">${escapeHtml(money(row.balance))}</td><td>${escapeHtml(formatPaymentMethod(row.payment_method))}</td><td>${escapeHtml(formatSaleStatus(row.status))}</td></tr>`).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sales Report</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#111;margin:0}header{display:flex;justify-content:space-between;border-bottom:2px solid #064e3b;padding-bottom:8px;margin-bottom:10px}h1{margin:0;font-size:20px}h2{margin:3px 0 0;font-size:14px}.meta{text-align:right;line-height:1.6}.summary{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:10px}.card{border:1px solid #bbb;padding:6px}.card span{display:block;color:#555;font-size:8px;text-transform:uppercase}.card strong{display:block;margin-top:3px;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:4px;text-align:left;white-space:nowrap}th{background:#064e3b;color:#fff}.number{text-align:right}@media print{button{display:none}}button{margin:0 0 10px;padding:7px 12px;background:#064e3b;color:#fff;border:0;border-radius:4px}
  </style></head><body><button onclick="window.print()">Print</button><header><div><h1>${escapeHtml((data.store.store_name || 'SHOE GALLERY').toUpperCase())}</h1><h2>Sales Report</h2></div><div class="meta">Date Range: ${escapeHtml(formatReportPeriod(filters))}<br>Generated: ${escapeHtml(new Date(data.generatedAt).toLocaleString())}</div></header><section class="summary"><div class="card"><span>Total Sales</span><strong>${escapeHtml(money(summary.total_sales))}</strong></div><div class="card"><span>Invoices</span><strong>${summary.total_invoices}</strong></div><div class="card"><span>Items Sold</span><strong>${summary.items_sold}</strong></div><div class="card"><span>Discounts</span><strong>${escapeHtml(money(summary.total_discounts))}</strong></div><div class="card"><span>Received</span><strong>${escapeHtml(money(summary.total_received))}</strong></div><div class="card"><span>Outstanding</span><strong>${escapeHtml(money(summary.outstanding))}</strong></div></section><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Qty</th><th>Discount</th><th>Total</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
}
