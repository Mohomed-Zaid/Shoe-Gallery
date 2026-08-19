import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExpenseReportExportData, ExpenseReportFilters, ExpenseReportRow } from '../types/expenseReport';
import { expenseDateRange, formatExpenseDateTime } from '../utils/expenseReportDates';
import { downloadBlob } from './salesReportService';

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const xml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const money = (value: number) => `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const headers = ['Expense ID', 'Date', 'Expense', 'Payment Method', 'Amount', 'Recorded By', 'Cashup', 'Created At'];
const row = (expense: ExpenseReportRow): Array<string | number> => [
  expense.expense_id, formatExpenseDateTime(expense.expense_time), expense.description, 'Cash', expense.amount,
  expense.recorded_by, expense.cashup_number, formatExpenseDateTime(expense.created_at),
];

export function exportExpensesCsv(data: ExpenseReportExportData) {
  const content = '\ufeff' + [headers, ...data.rows.map(row)].map((values) => values.map(quote).join(',')).join('\r\n');
  downloadBlob('expenses-report.csv', content, 'text/csv;charset=utf-8');
}

function sheet(name: string, rows: Array<Array<string | number>>) {
  return `<Worksheet ss:Name="${name}"><Table>${rows.map((values) => `<Row>${values.map((value) => `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xml(value)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`;
}

export function exportExpensesExcel(data: ExpenseReportExportData) {
  const categoryRows: Array<Array<string | number>> = [['Category', 'Expense Count', 'Total Amount', '% of Total']];
  const dailyRows = [['Date', 'Expense Count', 'Total Expenses'], ...data.daily.map((item) => [item.date, item.expense_count, item.total_expenses])];
  const paymentRows = [['Payment Method', 'Expense Count', 'Total Amount'], ...data.payments.map((item) => [item.payment_method, item.expense_count, item.total_amount])];
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheet('Expenses', [headers, ...data.rows.map(row)])}${sheet('Category Summary', categoryRows)}${sheet('Daily Summary', dailyRows)}${sheet('Payment Method Summary', paymentRows)}</Workbook>`;
  downloadBlob('expenses-report.xls', workbook, 'application/vnd.ms-excel');
}

function header(doc: jsPDF, data: ExpenseReportExportData, filters: ExpenseReportFilters) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(5, 44, 36);
  doc.rect(0, 0, width, 27, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SHOE GALLERY', 12, 10);
  doc.setFontSize(11);
  doc.text('Expenses Report', width - 12, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(expenseDateRange(filters.startDate, filters.endDate), 12, 18);
  doc.text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, width - 12, 18, { align: 'right' });
}

export function downloadExpensesPdf(data: ExpenseReportExportData, filters: ExpenseReportFilters) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  header(doc, data, filters);
  const summary = data.summary;
  autoTable(doc, {
    startY: 32,
    theme: 'grid',
    head: [['Total Expenses', 'Expense Count', "Today's Expenses", 'Cash Expenses', 'Non-Cash Expenses']],
    body: [[money(summary.total_expenses), summary.expense_count, money(summary.today_expenses), money(summary.cash_expenses), money(summary.non_cash_expenses)]],
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [5, 44, 36] },
  });
  const startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45) + 5;
  autoTable(doc, {
    startY,
    theme: 'grid',
    margin: { left: 7, right: 7, bottom: 12 },
    head: [['Date', 'Expense', 'Payment', 'Amount', 'Recorded By', 'Cashup']],
    body: data.rows.map((expense) => [formatExpenseDateTime(expense.expense_time), expense.description, 'Cash', money(expense.amount), expense.recorded_by, expense.cashup_number]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [5, 44, 36] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
  });
  doc.save('expenses-report.pdf');
}
