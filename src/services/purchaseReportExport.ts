import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PurchaseReportExportData, PurchaseReportFilters, PurchaseReportRow } from '../types/purchaseReport';
import { displayPurchaseDateRange } from '../utils/purchaseReportDates';
import { downloadBlob } from './salesReportService';

const titleCase = (value: string | null) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '—';
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const date = (value: string) => new Date(value).toLocaleDateString('en-GB');
const money = (value: number) => `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const headers = ['Purchase Number', 'Date', 'Supplier', 'Supplier Invoice', 'Item Lines', 'Quantity', 'Subtotal', 'Discount', 'Additional Cost', 'Total', 'Paid', 'Balance', 'Payment Status', 'Status', 'Created By'];
const exportRow = (row: PurchaseReportRow): Array<string | number> => [
  row.purchase_number, date(row.purchase_date), row.supplier_name, row.supplier_invoice_number ?? '',
  row.item_lines, row.total_quantity, row.subtotal, row.discount_amount, row.additional_cost,
  row.total_amount, row.paid_amount, row.balance_amount, titleCase(row.payment_status), titleCase(row.status), row.created_by,
];

export function exportPurchaseReportCsv(data: PurchaseReportExportData) {
  const csv = [headers, ...data.rows.map(exportRow)].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadBlob('purchase-report.csv', `\ufeff${csv}`, 'text/csv;charset=utf-8');
}

const xmlText = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function exportPurchaseReportExcel(data: PurchaseReportExportData) {
  const rows = [headers, ...data.rows.map(exportRow)].map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xmlText(value)}</Data></Cell>`).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Purchase Report"><Table>${rows}</Table></Worksheet></Workbook>`;
  downloadBlob('purchase-report.xls', xml, 'application/vnd.ms-excel');
}

export function downloadPurchaseReportPdf(data: PurchaseReportExportData, filters: PurchaseReportFilters) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(5, 44, 36); doc.rect(0, 0, width, 27, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('SHOE GALLERY', 12, 10);
  doc.setFontSize(11); doc.text('Purchase Report', width - 12, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`Date range: ${displayPurchaseDateRange(filters.startDate, filters.endDate)}`, 12, 18);
  doc.text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, width - 12, 18, { align: 'right' });
  const s = data.summary;
  autoTable(doc, { startY: 32, theme: 'grid', margin: { left: 9, right: 9 },
    head: [['Total Purchase Value', 'Purchases', 'Quantity Purchased', 'Paid', 'Outstanding', 'Discounts']],
    body: [[money(s.total_purchase_value), s.total_purchases, s.total_quantity, money(s.total_paid), money(s.total_outstanding), money(s.total_discounts)]],
    styles: { fontSize: 7.5, cellPadding: 2 }, headStyles: { fillColor: [5, 44, 36] },
  });
  const startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45) + 5;
  autoTable(doc, { startY, theme: 'grid', margin: { left: 6, right: 6, bottom: 12 },
    head: [['Purchase No', 'Date', 'Supplier', 'Supplier Invoice', 'Qty', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Payment', 'Status']],
    body: data.rows.map((row) => [row.purchase_number, date(row.purchase_date), row.supplier_name, row.supplier_invoice_number || '—', row.total_quantity, money(row.subtotal), money(row.discount_amount), money(row.total_amount), money(row.paid_amount), money(row.balance_amount), titleCase(row.payment_status), titleCase(row.status)]),
    styles: { fontSize: 6.6, cellPadding: 1.3 }, headStyles: { fillColor: [5, 44, 36] }, alternateRowStyles: { fillColor: [241, 245, 249] },
    didDrawPage: () => { const height = doc.internal.pageSize.getHeight(); doc.setFontSize(7); doc.setTextColor(71, 85, 105); doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, width - 8, height - 4, { align: 'right' }); },
  });
  doc.save('purchase-report.pdf');
}
