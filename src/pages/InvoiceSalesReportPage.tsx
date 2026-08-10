import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Eye, FileSpreadsheet, FileText, Printer, RefreshCw, Search } from 'lucide-react';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal, PageHeader, Select } from '../components/ui';
import {
  exportInvoiceSalesReportCsv,
  exportInvoiceSalesReportExcel,
  formatPaymentMethod,
  formatReportPeriod,
  formatSaleStatus,
  getInvoiceSalesReport,
  getInvoiceSalesReportDetail,
  getInvoiceSalesReportExportData,
  getInvoiceSalesReportOptions,
  getPresetDates,
} from '../services/invoiceSalesReportService';
import { exportInvoiceSalesReportPdf, printInvoiceSalesReport } from '../services/invoiceSalesReportExport';
import type {
  InvoiceSalesReportDetail,
  InvoiceSalesReportFilters,
  InvoiceSalesReportOptions,
  InvoiceSalesReportRow,
  InvoiceSalesReportSummary,
  SalesReportPageSize,
  SalesReportPreset,
  SalesReportSort,
} from '../types/invoiceSalesReport';
import { formatCurrency } from '../utils/format';

const todayDates = getPresetDates('today');
const defaultFilters: InvoiceSalesReportFilters = { ...todayDates, search: '', cashierId: '', paymentMethod: '', status: '' };
const emptySummary: InvoiceSalesReportSummary = { total_sales: 0, total_invoices: 0, items_sold: 0, total_discounts: 0, total_received: 0, outstanding: 0 };
const presets: Array<{ value: SalesReportPreset; label: string }> = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' }, { value: 'last_month', label: 'Last Month' }, { value: 'all_time', label: 'All Time' }, { value: 'custom', label: 'Custom Range' },
];

export function InvoiceSalesReportPage() {
  const [preset, setPreset] = useState<SalesReportPreset>('today');
  const [draft, setDraft] = useState<InvoiceSalesReportFilters>(defaultFilters);
  const [filters, setFilters] = useState<InvoiceSalesReportFilters>(defaultFilters);
  const [rows, setRows] = useState<InvoiceSalesReportRow[]>([]);
  const [summary, setSummary] = useState<InvoiceSalesReportSummary>(emptySummary);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<SalesReportPageSize>(25);
  const [sort, setSort] = useState<SalesReportSort>('date_desc');
  const [options, setOptions] = useState<InvoiceSalesReportOptions>({ cashiers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<InvoiceSalesReportDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    void getInvoiceSalesReportOptions().then(setOptions).catch((reason) => console.error('Unable to load Sales Report options.', reason));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const result = await getInvoiceSalesReport(filters, page, pageSize, sort);
      setRows(result.rows); setSummary(result.summary); setCount(result.count);
    } catch (reason) {
      console.error('Unable to load Sales Report.', reason);
      setError(true); setRows([]); setSummary(emptySummary); setCount(0);
    } finally { setLoading(false); }
  }, [filters, page, pageSize, sort]);

  useEffect(() => { void load(); }, [load]);

  const choosePreset = (next: SalesReportPreset) => {
    setPreset(next);
    if (next === 'custom') return;
    const dates = getPresetDates(next);
    const nextFilters = { ...draft, ...dates };
    setDraft(nextFilters); setFilters(nextFilters); setPage(1);
  };

  const applyFilters = (event?: FormEvent) => {
    event?.preventDefault();
    if ((draft.startDate && !draft.endDate) || (!draft.startDate && draft.endDate) || (draft.startDate && draft.endDate && draft.startDate > draft.endDate)) return;
    setFilters(draft); setPage(1);
  };

  const clearFilters = () => {
    const cleared = { ...defaultFilters };
    setPreset('today'); setDraft(cleared); setFilters(cleared); setPage(1); setSort('date_desc');
  };

  const runExport = async (action: (data: Awaited<ReturnType<typeof getInvoiceSalesReportExportData>>) => void) => {
    setExporting(true); setError(false);
    try { action(await getInvoiceSalesReportExportData(filters, sort)); }
    catch (reason) { console.error('Unable to export Sales Report.', reason); setError(true); }
    finally { setExporting(false); }
  };

  const openDetail = async (saleId: string) => {
    setDetailId(saleId); setDetail(undefined); setDetailLoading(true); setDetailError(false);
    try { setDetail(await getInvoiceSalesReportDetail(saleId)); }
    catch (reason) { console.error('Unable to load invoice details.', reason); setDetailError(true); }
    finally { setDetailLoading(false); }
  };

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const firstShown = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, count);
  const period = formatReportPeriod(filters);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales Report"
        description={`Complete sales and invoice history · ${period}`}
        action={<div className="flex flex-wrap gap-2 print-hidden">
          <Button variant="secondary" disabled={exporting} onClick={() => void runExport(exportInvoiceSalesReportCsv)}><Download size={16} />CSV</Button>
          <Button variant="secondary" disabled={exporting} onClick={() => void runExport(exportInvoiceSalesReportExcel)}><FileSpreadsheet size={16} />Excel</Button>
          <Button variant="secondary" disabled={exporting} onClick={() => void runExport((data) => exportInvoiceSalesReportPdf(data, filters))}><FileText size={16} />PDF</Button>
          <Button variant="secondary" disabled={exporting} onClick={() => void runExport((data) => printInvoiceSalesReport(data, filters))}><Printer size={16} />Print</Button>
          <Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
        </div>}
      />

      {!loading && !error && <SummaryCards summary={summary} />}

      <section className="glass-card p-4">
        <form className="relative z-10 space-y-4" onSubmit={applyFilters}>
          <div className="flex flex-wrap gap-2">
            {presets.map((option) => <Button key={option.value} type="button" size="sm" variant={preset === option.value ? 'primary' : 'secondary'} onClick={() => choosePreset(option.value)}>{option.label}</Button>)}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2"><Input aria-label="Search invoice, customer" placeholder="Search invoice, customer..." value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} /></div>
            <Select aria-label="Payment Method" value={draft.paymentMethod} onChange={(event) => setDraft((current) => ({ ...current, paymentMethod: event.target.value }))}>
              <option value="">All payments</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="credit">Credit</option><option value="other">Other</option><option value="split">Split</option>
            </Select>
            <Select aria-label="Cashier" value={draft.cashierId} onChange={(event) => setDraft((current) => ({ ...current, cashierId: event.target.value }))}>
              <option value="">All cashiers</option>{options.cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
            </Select>
            <Select aria-label="Status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option><option value="completed">Completed</option><option value="partially_returned">Partially Returned</option><option value="fully_returned">Fully Returned</option><option value="cancelled">Cancelled</option>
            </Select>
            <Button type="submit"><Search size={16} />Apply Filters</Button>
          </div>
          {preset === 'custom' && <div className="grid max-w-xl gap-3 sm:grid-cols-2"><Input label="From Date" type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} /><Input label="To Date" type="date" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} /></div>}
        </form>
      </section>

      {error ? (
        <section className="glass-card p-6 text-center"><Alert message="Unable to load Sales Report." /><Button className="mt-4" onClick={() => void load()}>Retry</Button></section>
      ) : loading ? (
        <section className="glass-card flex min-h-72 items-center justify-center"><LoadingSpinner /></section>
      ) : rows.length === 0 ? (
        <section className="glass-card p-10 text-center"><h2 className="text-lg font-semibold text-dashboard-text-primary">No sales found for this period.</h2><Button className="mt-4" variant="secondary" onClick={clearFilters}>Clear Filters</Button></section>
      ) : (
        <section className="glass-card overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 p-4">
            <p className="text-sm text-dashboard-text-sub">Showing {firstShown}-{lastShown} of {count.toLocaleString()} invoices</p>
            <div className="flex flex-wrap gap-3">
              <Select label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as SalesReportSort); setPage(1); }}>
                <option value="date_desc">Date · Newest</option><option value="date_asc">Date · Oldest</option><option value="invoice_asc">Invoice · A-Z</option><option value="invoice_desc">Invoice · Z-A</option><option value="customer_asc">Customer · A-Z</option><option value="customer_desc">Customer · Z-A</option><option value="total_desc">Total · High-Low</option><option value="total_asc">Total · Low-High</option><option value="balance_desc">Balance · High-Low</option><option value="balance_asc">Balance · Low-High</option>
              </Select>
              <Select label="Rows" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as SalesReportPageSize); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></Select>
            </div>
          </div>
          <SalesTable rows={rows} onView={openDetail} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4"><p className="text-sm text-dashboard-text-sub">Showing {firstShown}-{lastShown} of {count.toLocaleString()} invoices</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
        </section>
      )}

      {detailId && <InvoiceDetailModal detail={detail} loading={detailLoading} error={detailError} onRetry={() => void openDetail(detailId)} onClose={() => { setDetailId(undefined); setDetail(undefined); }} />}
    </div>
  );
}

function SummaryCards({ summary }: { summary: InvoiceSalesReportSummary }) {
  const cards = [['Total Sales', formatCurrency(summary.total_sales)], ['Total Invoices', summary.total_invoices.toLocaleString()], ['Items Sold', summary.items_sold.toLocaleString()], ['Total Discounts', formatCurrency(summary.total_discounts)], ['Total Received', formatCurrency(summary.total_received)], ['Outstanding', formatCurrency(summary.outstanding)]];
  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{cards.map(([label, value]) => <article key={label} className="glass-card p-4"><p className="text-xs uppercase tracking-wide text-dashboard-text-label">{label}</p><p className="mt-2 text-xl font-bold text-dashboard-text-primary">{value}</p></article>)}</section>;
}

function SalesTable({ rows, onView }: { rows: InvoiceSalesReportRow[]; onView: (saleId: string) => void }) {
  const moneyHeader = 'text-right';
  return <DataTable columns={[{ key: 'invoice', header: 'Invoice' }, { key: 'date', header: 'Date' }, { key: 'time', header: 'Time' }, { key: 'customer', header: 'Customer' }, { key: 'cashier', header: 'Cashier' }, { key: 'qty', header: 'Qty', className: moneyHeader }, { key: 'subtotal', header: 'Subtotal', className: moneyHeader }, { key: 'discount', header: 'Discount', className: moneyHeader }, { key: 'total', header: 'Total', className: moneyHeader }, { key: 'paid', header: 'Paid', className: moneyHeader }, { key: 'balance', header: 'Balance', className: moneyHeader }, { key: 'payment', header: 'Payment' }, { key: 'status', header: 'Status' }, { key: 'actions', header: 'Actions' }]}>
    {rows.map((row) => { const created = new Date(row.created_at); return <tr key={row.sale_id} className="hover:bg-dashboard-hover"><td className="whitespace-nowrap px-4 py-3 font-semibold text-dashboard-text-primary">{row.invoice_number}</td><td className="whitespace-nowrap px-4 py-3 text-sm text-dashboard-text-sub">{created.toLocaleDateString()}</td><td className="whitespace-nowrap px-4 py-3 text-sm text-dashboard-text-sub">{created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-4 py-3 text-sm"><p className="max-w-44 truncate text-dashboard-text-primary">{row.customer_name}</p>{row.customer_phone && <p className="text-xs text-dashboard-text-sub">{row.customer_phone}</p>}</td><td className="whitespace-nowrap px-4 py-3 text-sm text-dashboard-text-sub">{row.cashier_name}</td><td className="px-4 py-3 text-right text-sm">{row.total_quantity}</td><MoneyCell value={row.subtotal} /><MoneyCell value={row.discount} /><MoneyCell value={row.total} strong /><MoneyCell value={row.paid} /><MoneyCell value={row.balance} /><td className="whitespace-nowrap px-4 py-3 text-sm text-dashboard-text-sub">{formatPaymentMethod(row.payment_method)}</td><td className="whitespace-nowrap px-4 py-3"><Status value={row.status} /></td><td className="px-4 py-3"><Button size="sm" variant="ghost" onClick={() => void onView(row.sale_id)}><Eye size={16} />View</Button></td></tr>; })}
  </DataTable>;
}

function MoneyCell({ value, strong = false }: { value: number; strong?: boolean }) { return <td className={`whitespace-nowrap px-4 py-3 text-right text-sm ${strong ? 'font-semibold text-dashboard-text-primary' : ''}`}>{formatCurrency(value)}</td>; }
function Status({ value }: { value: string }) { const colour = value === 'cancelled' ? 'border-red-400/25 bg-red-400/10 text-red-300' : value.includes('returned') ? 'border-amber-400/25 bg-amber-400/10 text-amber-300' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'; return <span className={`rounded-full border px-2 py-1 text-xs ${colour}`}>{formatSaleStatus(value)}</span>; }

function InvoiceDetailModal({ detail, loading, error, onRetry, onClose }: { detail?: InvoiceSalesReportDetail; loading: boolean; error: boolean; onRetry: () => void; onClose: () => void }) {
  const hasCost = detail?.items.some((item) => item.historicalCost != null) ?? false;
  return <Modal title={detail?.sale.invoice_number || 'Invoice Details'} onClose={onClose} size="xl" respectSidebar>{loading ? <div className="flex min-h-64 items-center justify-center"><LoadingSpinner /></div> : error || !detail ? <div className="text-center"><Alert message="Unable to load invoice details." /><Button className="mt-4" onClick={onRetry}>Retry</Button></div> : <div className="space-y-6">
    <section><h3 className="mb-3 font-semibold text-dashboard-text-primary">Invoice Information</h3><div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-3"><Info label="Invoice" value={detail.sale.invoice_number} /><Info label="Date" value={new Date(detail.sale.created_at).toLocaleDateString()} /><Info label="Time" value={new Date(detail.sale.created_at).toLocaleTimeString()} /><Info label="Cashier" value={detail.sale.cashier_name} /><Info label="Customer" value={detail.sale.customer_name} /><Info label="Payment" value={formatPaymentMethod(detail.sale.payment_method)} /></div></section>
    <section><h3 className="mb-3 font-semibold text-dashboard-text-primary">Items Sold</h3><DataTable columns={[{ key: 'product', header: 'Product' }, { key: 'item', header: 'Item Number' }, { key: 'barcode', header: 'Barcode' }, { key: 'size', header: 'Size' }, { key: 'colour', header: 'Colour' }, { key: 'qty', header: 'Qty', className: 'text-right' }, { key: 'price', header: 'Unit Price', className: 'text-right' }, { key: 'discount', header: 'Discount', className: 'text-right' }, { key: 'total', header: 'Total', className: 'text-right' }, ...(hasCost ? [{ key: 'cost', header: 'Cost', className: 'text-right' }, { key: 'profit', header: 'Profit', className: 'text-right' }] : [])]}>{detail.items.map((item) => <tr key={item.id}><td className="px-4 py-3 text-sm text-dashboard-text-primary">{item.product}<span className="block text-xs text-dashboard-text-sub">Article: {item.itemArticle}</span></td><td className="px-4 py-3 text-sm">{item.itemNumber}</td><td className="px-4 py-3 text-sm">{item.barcode}</td><td className="px-4 py-3 text-sm">{item.size}</td><td className="px-4 py-3 text-sm">{item.colour}</td><td className="px-4 py-3 text-right text-sm">{item.quantity}</td><MoneyCell value={item.unitPrice} /><MoneyCell value={item.discount} /><MoneyCell value={item.total} strong />{hasCost && <><td className="px-4 py-3 text-right text-sm">{item.historicalCost == null ? '—' : formatCurrency(item.historicalCost * item.quantity)}</td><td className="px-4 py-3 text-right text-sm">{item.historicalCost == null ? '—' : formatCurrency(item.total - item.historicalCost * item.quantity)}</td></>}</tr>)}</DataTable></section>
    <section className="ml-auto max-w-md space-y-2">{[['Subtotal', detail.sale.subtotal], ['Discount', detail.sale.discount], ['Grand Total', detail.sale.total], ['Paid', detail.sale.paid], ['Balance', detail.sale.balance], ['Change', detail.sale.change]].map(([label, value]) => <div key={String(label)} className="flex justify-between border-b border-white/10 py-2"><span className="text-dashboard-text-sub">{label}</span><strong>{formatCurrency(Number(value))}</strong></div>)}</section>
    {detail.returns.length > 0 && <section><h3 className="mb-3 font-semibold text-dashboard-text-primary">Returns</h3><DataTable columns={[{ key: 'product', header: 'Product' }, { key: 'size', header: 'Size' }, { key: 'colour', header: 'Colour' }, { key: 'qty', header: 'Returned Qty', className: 'text-right' }, { key: 'amount', header: 'Return Amount', className: 'text-right' }, { key: 'date', header: 'Return Date' }]}>{detail.returns.map((item) => <tr key={item.id}><td className="px-4 py-3 text-sm">{item.product}</td><td className="px-4 py-3 text-sm">{item.size}</td><td className="px-4 py-3 text-sm">{item.colour}</td><td className="px-4 py-3 text-right text-sm">{item.quantity}</td><MoneyCell value={item.amount} /><td className="px-4 py-3 text-sm">{new Date(item.returnedAt).toLocaleString()}</td></tr>)}</DataTable></section>}
  </div>}</Modal>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-dashboard-text-label">{label}</p><p className="mt-1 text-sm font-medium text-dashboard-text-primary">{value}</p></div>; }
