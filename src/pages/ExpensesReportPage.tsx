import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Eye, FileSpreadsheet, FileText, Printer, RotateCcw, Search } from 'lucide-react';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal, PageHeader, Pagination, Select } from '../components/ui';
import { downloadExpensesPdf, exportExpensesCsv, exportExpensesExcel } from '../services/expenseReportExport';
import { getExpensesReport, getExpensesReportExportData } from '../services/expenseReportService';
import type {
  ExpenseReportExportData, ExpenseReportFilters, ExpenseReportPageSize, ExpenseReportPreset,
  ExpenseReportResult, ExpenseReportRow, ExpenseReportSort, ExpenseReportSummary,
} from '../types/expenseReport';
import { expenseDateRange, expensePresetDates, formatExpenseDateTime } from '../utils/expenseReportDates';
import { formatCurrency } from '../utils/format';

const presets: Array<[ExpenseReportPreset, string]> = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last_7_days', 'Last 7 Days'],
  ['this_month', 'This Month'], ['last_month', 'Last Month'], ['this_year', 'This Year'],
  ['all_time', 'All Time'], ['custom', 'Custom Range'],
];
const defaults = (): ExpenseReportFilters => ({ ...expensePresetDates('this_month'), search: '', recordedById: '', sessionId: '', paymentMethod: '' });

export function ExpensesReportPage() {
  const [preset, setPreset] = useState<ExpenseReportPreset>('this_month');
  const [draft, setDraft] = useState<ExpenseReportFilters>(defaults);
  const [filters, setFilters] = useState<ExpenseReportFilters>(defaults);
  const [result, setResult] = useState<ExpenseReportResult>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ExpenseReportPageSize>(25);
  const [sort, setSort] = useState<ExpenseReportSort>('newest');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [detail, setDetail] = useState<ExpenseReportRow>();
  const [printData, setPrintData] = useState<ExpenseReportExportData>();

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(undefined);
    try { setResult(await getExpensesReport(filters, page, pageSize, sort, refresh)); }
    catch (cause) { if (import.meta.env.DEV) console.error(cause); setError('Unable to load Expenses Report.'); }
    finally { setLoading(false); }
  }, [filters, page, pageSize, sort]);
  useEffect(() => { void load(); }, [load]);

  const choosePreset = (value: ExpenseReportPreset) => {
    setPreset(value);
    if (value !== 'custom') setDraft((current) => ({ ...current, ...expensePresetDates(value) }));
  };
  const apply = () => {
    if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) { setError('From Date must be before To Date.'); return; }
    setError(undefined); setPage(1); setFilters(draft);
  };
  const clear = () => {
    const value = defaults(); setPreset('this_month'); setDraft(value); setFilters(value); setPage(1); setSort('newest');
  };
  const prepare = async (action: (data: ExpenseReportExportData) => void) => {
    setExporting(true); setError(undefined);
    try { action(await getExpensesReportExportData(filters, sort)); }
    catch (cause) { if (import.meta.env.DEV) console.error(cause); setError('Unable to export Expenses Report.'); }
    finally { setExporting(false); }
  };
  const print = async () => {
    setExporting(true); setError(undefined);
    try { const data = await getExpensesReportExportData(filters, sort); setPrintData(data); setTimeout(() => window.print(), 100); }
    catch (cause) { if (import.meta.env.DEV) console.error(cause); setError('Unable to print Expenses Report.'); }
    finally { setExporting(false); }
  };

  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  const range = expenseDateRange(filters.startDate, filters.endDate);

  return <div className="expenses-report-page min-w-0 space-y-5 overflow-x-hidden">
    <PageHeader title="Expenses Report" description={`Complete business expense history and analysis · ${range}`} action={<div className="print-hidden flex flex-wrap gap-2"><Button variant="secondary" disabled={exporting} onClick={() => void prepare(exportExpensesCsv)}><Download size={16}/>CSV</Button><Button variant="secondary" disabled={exporting} onClick={() => void prepare(exportExpensesExcel)}><FileSpreadsheet size={16}/>Excel</Button><Button variant="secondary" disabled={exporting} onClick={() => void prepare((data) => downloadExpensesPdf(data, filters))}><FileText size={16}/>PDF</Button><Button variant="secondary" disabled={exporting} onClick={() => void print()}><Printer size={16}/>Print</Button></div>}/>
    <Filters value={draft} preset={preset} options={result?.options} onPreset={choosePreset} onChange={(value) => { setDraft(value); setPreset('custom'); }} onApply={apply} onReset={clear}/>
    {error && <div className="space-y-2"><Alert message={error}/><Button variant="secondary" onClick={() => void load(true)}>Retry</Button></div>}
    {loading ? <SummarySkeleton/> : result && <Summary summary={result.summary}/>} 
    <section className="glass-card overflow-hidden">
      <div className="print-hidden flex flex-wrap items-end justify-between gap-3 border-b border-white/10 p-4"><div><h2 className="font-semibold">Expense Records</h2><p className="text-xs text-dashboard-text-sub">Showing {first}-{last} of {total} expenses</p></div><div className="flex flex-wrap gap-3"><Select label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as ExpenseReportSort); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="expense_asc">Expense A-Z</option><option value="amount_desc">Amount high-low</option><option value="amount_asc">Amount low-high</option></Select><Select label="Rows" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as ExpenseReportPageSize); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></Select></div></div>
      {loading ? <div className="flex min-h-72 items-center justify-center"><LoadingSpinner/></div> : !result?.rows.length ? <div className="flex min-h-72 flex-col items-center justify-center gap-4"><p className="text-dashboard-text-sub">No expenses found for this period.</p><Button variant="secondary" onClick={clear}>Clear Filters</Button></div> : <ExpenseTable rows={result.rows} onView={setDetail}/>} 
    </section>
    {!loading && total > 0 && <Pagination page={page} totalPages={pages} onPageChange={setPage}/>} 
    {!loading && result && <div className="grid gap-4 xl:grid-cols-2"><DailySummary rows={result.daily}/><PaymentSummary rows={result.payments}/></div>}
    {!loading && result && <Trend data={result.trend}/>} 
    {detail && <ExpenseDetail expense={detail} onClose={() => setDetail(undefined)}/>} 
    {printData && <PrintReport data={printData} range={range}/>} 
  </div>;
}

function Filters({ value, preset, options, onPreset, onChange, onApply, onReset }: {
  value: ExpenseReportFilters; preset: ExpenseReportPreset; options?: ExpenseReportResult['options'];
  onPreset: (value: ExpenseReportPreset) => void; onChange: (value: ExpenseReportFilters) => void; onApply: () => void; onReset: () => void;
}) {
  const set = (key: keyof ExpenseReportFilters, next: string) => onChange({ ...value, [key]: next });
  return <section className="glass-card print-hidden p-4"><div className="flex flex-wrap gap-2">{presets.map(([key, label]) => <button type="button" key={key} onClick={() => onPreset(key)} className={`rounded-xl px-3 py-2 text-xs ${preset === key ? 'bg-emerald-400 font-semibold text-slate-950' : 'border border-white/10 text-dashboard-text-sub'}`}>{label}</button>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Input label="From Date" type="date" value={value.startDate} onChange={(event) => set('startDate', event.target.value)}/><Input label="To Date" type="date" value={value.endDate} onChange={(event) => set('endDate', event.target.value)}/><Input label="Search" placeholder="Search expense, cashier, cashup..." value={value.search} onChange={(event) => set('search', event.target.value)}/><Select label="Payment Method" value={value.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)}><option value="">All Methods</option><option value="cash">Cash</option></Select><Select label="Recorded By" value={value.recordedById} onChange={(event) => set('recordedById', event.target.value)}><option value="">All Users</option>{options?.recordedBy.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select label="Cashup Session" value={value.sessionId} onChange={(event) => set('sessionId', event.target.value)}><option value="">All Cashups</option>{options?.cashups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><div className="flex gap-2 xl:col-start-6"><Button className="flex-1" onClick={onApply}><Search size={16}/>Run</Button><Button aria-label="Clear filters" variant="secondary" onClick={onReset}><RotateCcw size={16}/></Button></div></div></section>;
}

function Summary({ summary }: { summary: ExpenseReportSummary }) {
  const cards = [['Total Expenses', formatCurrency(summary.total_expenses)], ['Expense Count', summary.expense_count.toLocaleString()], ["Today's Expenses", formatCurrency(summary.today_expenses)], ['This Month Expenses', formatCurrency(summary.this_month_expenses)], ['Cash Expenses', formatCurrency(summary.cash_expenses)], ['Non-Cash Expenses', formatCurrency(summary.non_cash_expenses)]];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{cards.map(([label, value]) => <div className="glass-card p-4" key={String(label)}><p className="text-xs uppercase text-dashboard-text-label">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>)}</div>;
}
function SummarySkeleton() { return <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="glass-card h-24"/>)}</div>; }

function ExpenseTable({ rows, onView }: { rows: ExpenseReportRow[]; onView: (row: ExpenseReportRow) => void }) {
  const columns = [{ key: 'date', header: 'Date' }, { key: 'expense', header: 'Expense' }, { key: 'payment', header: 'Payment' }, { key: 'amount', header: 'Amount' }, { key: 'user', header: 'Recorded By', className: 'hidden xl:table-cell' }, { key: 'cashup', header: 'Cashup', className: 'hidden lg:table-cell' }, { key: 'actions', header: 'Actions' }];
  return <DataTable columns={columns} className="expenses-report-table">{rows.map((expense) => <tr key={expense.expense_id} className="hover:bg-dashboard-hover"><Cell>{formatExpenseDateTime(expense.expense_time)}</Cell><td className="max-w-72 px-4 py-3 text-sm font-semibold"><p className="truncate" title={expense.description}>{expense.description}</p><p className="mt-0.5 truncate font-normal text-dashboard-text-sub xl:hidden">{expense.recorded_by}</p></td><Cell>Cash</Cell><Cell strong>{formatCurrency(expense.amount)}</Cell><Cell className="hidden xl:table-cell">{expense.recorded_by}</Cell><Cell className="hidden lg:table-cell">{expense.cashup_number}</Cell><td className="sticky right-0 bg-[#061711] px-3 py-2"><Button size="sm" variant="secondary" onClick={() => onView(expense)}><Eye size={15}/>View</Button></td></tr>)}</DataTable>;
}
function Cell({ children, strong = false, className = '' }: { children: ReactNode; strong?: boolean; className?: string }) { return <td className={`whitespace-nowrap px-4 py-3 text-sm ${strong ? 'font-semibold' : 'text-dashboard-text-sub'} ${className}`}>{children}</td>; }

function ExpenseDetail({ expense, onClose }: { expense: ExpenseReportRow; onClose: () => void }) {
  const values = [['Expense ID', expense.expense_id], ['Date', formatExpenseDateTime(expense.expense_time)], ['Description', expense.description], ['Amount', formatCurrency(expense.amount)], ['Payment Method', 'Cash'], ['Recorded By', expense.recorded_by], ['Created At', formatExpenseDateTime(expense.created_at)], ['Cashup Session', expense.cashup_number]];
  return <Modal title="Expense Information" onClose={onClose} size="lg" respectSidebar><div className="grid gap-4 sm:grid-cols-2">{values.map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 p-4"><p className="text-xs uppercase text-dashboard-text-label">{label}</p><p className="mt-1 break-words font-medium text-dashboard-text-primary">{value}</p></div>)}</div></Modal>;
}

function DailySummary({ rows }: { rows: ExpenseReportResult['daily'] }) { return <MiniTable title="Daily Expenses" headers={['Date', 'Expense Count', 'Total Expenses']} rows={rows.map((row) => [row.date.split('-').reverse().join('/'), row.expense_count, formatCurrency(row.total_expenses)])}/>; }
function PaymentSummary({ rows }: { rows: ExpenseReportResult['payments'] }) { return <MiniTable title="Expenses by Payment Method" headers={['Payment Method', 'Expense Count', 'Total Amount']} rows={rows.map((row) => [row.payment_method, row.expense_count, formatCurrency(row.total_amount)])}/>; }
function MiniTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<ReactNode>> }) { return <section className="glass-card p-4"><h3 className="mb-3 font-semibold">{title}</h3>{rows.length ? <DataTable columns={headers.map((header, index) => ({ key: String(index), header }))}>{rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <Cell key={cell}>{value}</Cell>)}</tr>)}</DataTable> : <p className="py-8 text-center text-sm text-dashboard-text-sub">No expense data for this period.</p>}</section>; }

function Trend({ data }: { data: ExpenseReportResult['trend'] }) { return <section className="glass-card p-4"><h3 className="mb-4 font-semibold">Expenses Trend</h3>{data.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)"/><XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }}/><YAxis tick={{ fill: '#94a3b8', fontSize: 11 }}/><Tooltip contentStyle={{ background: '#061711', border: '1px solid rgba(255,255,255,.15)' }}/><Bar dataKey="total" name="Expenses" fill="#34d399" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div> : <p className="py-12 text-center text-dashboard-text-sub">No expense data for this period.</p>}</section>; }

function PrintReport({ data, range }: { data: ExpenseReportExportData; range: string }) {
  const summary = data.summary;
  return <div className="report-print-area business-report-print-area expenses-report-print"><div className="report-header"><div><p className="report-eyebrow">SHOE GALLERY</p><h1>Expenses Report</h1><p className="report-subtitle">Complete business expense history and analysis</p></div><dl className="report-meta-grid"><div><dt>Date Range</dt><dd>{range}</dd></div><div><dt>Generated</dt><dd>{new Date(data.generatedAt).toLocaleString()}</dd></div></dl></div><div className="report-kpi-grid">{[['Total Expenses', formatCurrency(summary.total_expenses)], ['Expense Count', summary.expense_count], ["Today's Expenses", formatCurrency(summary.today_expenses)], ['Cash Expenses', formatCurrency(summary.cash_expenses)], ['Non-Cash Expenses', formatCurrency(summary.non_cash_expenses)]].map(([label, value]) => <div className="report-kpi" key={String(label)}><span className="report-kpi-label">{label}</span><span className="report-kpi-value">{value}</span></div>)}</div><table className="report-table"><thead><tr>{['Date', 'Expense', 'Payment', 'Amount', 'Recorded By', 'Cashup'].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{data.rows.map((expense) => <tr key={expense.expense_id}><td>{formatExpenseDateTime(expense.expense_time)}</td><td>{expense.description}</td><td>Cash</td><td>{formatCurrency(expense.amount)}</td><td>{expense.recorded_by}</td><td>{expense.cashup_number}</td></tr>)}</tbody></table></div>;
}
