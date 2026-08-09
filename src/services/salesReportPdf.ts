import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SalesReportExportData, SalesReportFilters } from '../types/salesReport';
import { formatPaymentMethod, formatStatus } from './salesReportService';

const navy: [number, number, number] = [15, 23, 42];
const border: [number, number, number] = [203, 213, 225];
const pale: [number, number, number] = [241, 245, 249];
const money = (value: number) => `Rs. ${Number(value).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function downloadSimpleSalesReportPdf(
  data: SalesReportExportData,
  filters: SalesReportFilters,
  generatedBy: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const summary = data.summary;

  doc.setFillColor(...navy);
  doc.rect(0, 0, width, 27, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(data.store.store_name || 'Shoe Gallery', 12, 10);
  doc.setFontSize(11);
  doc.text('Sales Report', width - 12, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text([data.store.address, data.store.phone].filter(Boolean).join(' | ').slice(0, 110), 12, 17);
  doc.text(`${filters.startDate} to ${filters.endDate}`, width - 12, 17, { align: 'right' });

  autoTable(doc, {
    startY: 32,
    margin: { left: 10, right: 10 },
    theme: 'grid',
    head: [['Total Sales', 'Invoices', 'Quantity', 'Received', 'Outstanding']],
    body: [[money(summary.total_sales), summary.total_invoices, summary.total_quantity, money(summary.total_received), money(summary.total_outstanding)]],
    styles: { fontSize: 8, cellPadding: 2, textColor: navy, lineColor: border, lineWidth: 0.15 },
    headStyles: { fillColor: navy, textColor: [255, 255, 255] },
  });

  const startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45) + 6;
  autoTable(doc, {
    startY,
    margin: { left: 8, right: 8, bottom: 14 },
    theme: 'grid',
    head: [['Invoice', 'Date', 'Customer', 'Qty', 'Total', 'Paid', 'Balance', 'Payment', 'Status']],
    body: data.rows.map((row) => [
      row.invoice_number,
      new Date(row.created_at).toLocaleDateString(),
      row.customer_name,
      row.total_quantity,
      money(row.total),
      money(row.amount_paid),
      money(row.balance),
      formatPaymentMethod(row.payment_method),
      formatStatus(row.status),
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, textColor: navy, lineColor: border, lineWidth: 0.15 },
    headStyles: { fillColor: navy, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: pale },
    didDrawPage: () => {
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setTextColor(...navy);
      doc.setDrawColor(...border);
      doc.line(10, pageHeight - 9, pageWidth - 10, pageHeight - 9);
      doc.setFontSize(7);
      doc.text(`Generated ${new Date(data.generatedAt).toLocaleString()} by ${generatedBy}`, 10, pageHeight - 4);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 10, pageHeight - 4, { align: 'right' });
    },
  });

  doc.save(`sales-report-${filters.startDate}-to-${filters.endDate}.pdf`);
}
