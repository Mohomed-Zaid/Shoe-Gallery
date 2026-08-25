import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, Button, DataTable, LoadingSpinner, PageHeader, Pagination, Select } from '../components/ui';
import { SalesReportFilters } from '../components/reports/SalesReportFilters';
import { ThermalReceipt } from '../components/receipt/ThermalReceipt';
import { useAuth } from '../context/AuthContext';
import type { SaleWithRelations } from '../services/salesService';
import * as salesService from '../services/salesService';
import * as settingsService from '../services/settingsService';
import {
  exportSimpleSalesReportCsv,
  exportSimpleSalesReportExcel,
  formatPaymentMethod,
  formatStatus,
  getSalesReportExportData,
  getSalesReportFilterOptions,
  getSimpleSalesReport,
} from '../services/salesReportService';
import { downloadSimpleSalesReportPdf } from '../services/salesReportPdf';
import { printReceipt } from '../services/receiptPrintService';
import type { StoreSettings } from '../types';
import type {
  ReportPageSize,
  ReportPreset,
  ReportSort,
  SalesReportFilterOptions,
  SalesReportFilters as Filters,
  SalesReportRow,
  SalesReportSummary,
} from '../types/salesReport';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { presetDates } from '../utils/salesReportDates';

const createDefaultFilters = (): Filters => ({
  ...presetDates('this_month'),
  invoiceNumber: '',
  customerId: '',
  cashierId: '',
  paymentMethod: '',
  status: '',
});

const emptySummary: SalesReportSummary = {
  total_sales: 0,
  total_invoices: 0,
  total_quantity: 0,
  total_received: 0,
  total_outstanding: 0,
  total_discounts: 0,
  total_gross_card_amount: 0,
  total_card_processing_fees: 0,
  total_net_card_amount: 0,
};

const emptyOptions: SalesReportFilterOptions = { customers: [], cashiers: [] };

export function SalesReportPage() {
  const { profile } = useAuth();
  const [preset, setPreset] = useState<ReportPreset>('this_month');
  const [draft, setDraft] = useState<Filters>(createDefaultFilters);
  const [filters, setFilters] = useState<Filters>(createDefaultFilters);
  const [options, setOptions] = useState<SalesReportFilterOptions>(emptyOptions);
  const [rows, setRows] = useState<SalesReportRow[]>([]);
  const [summary, setSummary] = useState<SalesReportSummary>(emptySummary);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ReportPageSize>(25);
  const [sort, setSort] = useState<ReportSort>('newest');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [printingId, setPrintingId] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void getSalesReportFilterOptions()
      .then(setOptions)
      .catch((reason) => setError(getErrorMessage(reason)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await getSimpleSalesReport(filters, page, pageSize, sort);
      setRows(result.rows);
      setTotal(result.total);
      setSummary(result.summary);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sort]);

  useEffect(() => { void load(); }, [load]);

  const choosePreset = (next: ReportPreset) => {
    setPreset(next);
    if (next !== 'custom') setDraft((current) => ({ ...current, ...presetDates(next) }));
  };

  const applyFilters = () => {
    setPage(1);
    setFilters(draft);
  };

  const resetFilters = () => {
    const defaults = createDefaultFilters();
    setPreset('this_month');
    setDraft(defaults);
    setFilters(defaults);
    setPage(1);
    setSort('newest');
  };

  const prepareExport = async (action: (data: Awaited<ReturnType<typeof getSalesReportExportData>>) => void) => {
    setExporting(true);
    setError(undefined);
    try {
      action(await getSalesReportExportData(filters, sort));
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setExporting(false);
    }
  };

  const printSale = async (row: SalesReportRow) => {
    setPrintingId(row.id);
    setError(undefined);
    try {
      const [saleResult, settingsResult] = await Promise.all([
        salesService.getSaleById(row.id),
        settingsService.getStoreSettings(),
      ]);
      if (saleResult.error) throw saleResult.error;
      if (settingsResult.error) throw settingsResult.error;
      const sale = saleResult.data as SaleWithRelations | null;
      if (!sale) throw new Error('Sale not found.');
      const settings = settingsResult.data as StoreSettings | null;
      printReceipt(
        <ThermalReceipt
          sale={sale}
          items={sale.sale_items ?? []}
          payments={sale.sale_payments ?? []}
          customer={sale.customer}
          store={settings}
        />,
        { orientation: settings?.receipt_orientation ?? 'landscape' },
      );
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to print this receipt.'));
    } finally {
      setPrintingId(undefined);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="sales-report-page space-y-5">
      <PageHeader
        title="Sales Report"
        description="A simple invoice-level report. One sale always produces one row."
        action={
          <div className="flex flex-wrap gap-2 print-hidden">
            <Button variant="secondary" disabled={exporting} onClick={() => void prepareExport(exportSimpleSalesReportCsv)}>
              <Download size={16} />CSV
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={() => void prepareExport(exportSimpleSalesReportExcel)}>
              <FileSpreadsheet size={16} />Excel
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={() => void prepareExport((data) => downloadSimpleSalesReportPdf(data, filters, profile?.full_name || profile?.email || 'User'))}>
              <FileText size={16} />{exporting ? 'Preparing…' : 'PDF'}
            </Button>
          </div>
        }
      />

      <SalesReportFilters
        value={draft}
        preset={preset}
        options={options}
        onPreset={choosePreset}
        onChange={(value) => { setDraft(value); setPreset('custom'); }}
        onApply={applyFilters}
        onReset={resetFilters}
      />

      {error && <Alert message={error} />}
      <SummaryCards summary={summary} />

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 p-4 print-hidden">
          <div>
            <h2 className="font-semibold text-dashboard-text-primary">Invoices</h2>
            <p className="text-xs text-dashboard-text-sub">{total.toLocaleString()} matching sales</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Select label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as ReportSort); setPage(1); }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="invoice_asc">Invoice A–Z</option>
              <option value="invoice_desc">Invoice Z–A</option>
              <option value="total_desc">Total high–low</option>
              <option value="total_asc">Total low–high</option>
              <option value="customer_asc">Customer A–Z</option>
            </Select>
            <Select label="Rows" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as ReportPageSize); setPage(1); }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center"><LoadingSpinner /></div>
        ) : (
          <SalesTable rows={rows} printingId={printingId} onPrint={printSale} />
        )}
      </section>

      {!loading && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}

function SummaryCards({ summary }: { summary: SalesReportSummary }) {
  const deduction = summary.total_card_processing_fees === 0
    ? formatCurrency(0)
    : `-${formatCurrency(summary.total_card_processing_fees)}`;
  const cards = [
    ['Total Sales', formatCurrency(summary.total_sales)],
    ['Total Invoices', summary.total_invoices.toLocaleString()],
    ['Quantity Sold', summary.total_quantity.toLocaleString()],
    ['Total Received', formatCurrency(summary.total_received)],
    ['Outstanding', formatCurrency(summary.total_outstanding)],
    ['Discounts', formatCurrency(summary.total_discounts)],
    ['Gross Card Amount', formatCurrency(summary.total_gross_card_amount)],
    ['Card Fee (2.75%)', deduction],
    ['Net Card Amount', formatCurrency(summary.total_net_card_amount)],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 2xl:grid-cols-9">
      {cards.map(([label, value]) => (
        <div key={label} className="glass-card p-4">
          <p className="text-xs uppercase tracking-wide text-dashboard-text-label">{label}</p>
          <p className="mt-2 text-xl font-bold text-dashboard-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function SalesTable({
  rows,
  printingId,
  onPrint,
}: {
  rows: SalesReportRow[];
  printingId?: string;
  onPrint: (row: SalesReportRow) => Promise<void>;
}) {
  return (
    <DataTable
      columns={[
        { key: 'invoice', header: 'Invoice' },
        { key: 'date', header: 'Date' },
        { key: 'time', header: 'Time' },
        { key: 'customer', header: 'Customer' },
        { key: 'cashier', header: 'Cashier' },
        { key: 'items', header: 'Items' },
        { key: 'quantity', header: 'Qty' },
        { key: 'subtotal', header: 'Subtotal' },
        { key: 'discount', header: 'Discount' },
        { key: 'selling-price', header: 'Selling Price' },
        { key: 'gross-card', header: 'Gross Card Amount' },
        { key: 'card-fee', header: 'Card Fee (2.75%)' },
        { key: 'net-card', header: 'Net Card Amount' },
        { key: 'total', header: 'Total' },
        { key: 'paid', header: 'Paid' },
        { key: 'balance', header: 'Balance' },
        { key: 'payment', header: 'Payment' },
        { key: 'status', header: 'Status' },
        { key: 'actions', header: 'Actions', className: 'text-right' },
      ]}
      isEmpty={rows.length === 0}
      emptyMessage="No sales match the selected filters."
    >
      {rows.map((row) => {
        const date = new Date(row.created_at);
        return (
          <tr key={row.id} className="hover:bg-dashboard-hover">
            <td className="px-4 py-3 text-sm font-semibold text-dashboard-text-primary">{row.invoice_number}</td>
            <td className="px-4 py-3 text-sm text-dashboard-text-sub">{date.toLocaleDateString()}</td>
            <td className="px-4 py-3 text-sm text-dashboard-text-sub">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td className="px-4 py-3 text-sm text-dashboard-text-sub">{row.customer_name}</td>
            <td className="px-4 py-3 text-sm text-dashboard-text-sub">{row.cashier_name}</td>
            <td className="px-4 py-3 text-sm">{row.item_count}</td>
            <td className="px-4 py-3 text-sm">{row.total_quantity}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.subtotal)}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.discount)}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.selling_price)}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.gross_card_amount)}</td>
            <td className="px-4 py-3 text-sm text-red-300">{row.card_processing_fee === 0 ? formatCurrency(0) : `-${formatCurrency(row.card_processing_fee)}`}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.net_card_amount)}</td>
            <td className="px-4 py-3 text-sm font-semibold text-dashboard-text-primary">{formatCurrency(row.total)}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.amount_paid)}</td>
            <td className="px-4 py-3 text-sm">{formatCurrency(row.balance)}</td>
            <td className="px-4 py-3 text-sm text-dashboard-text-sub">{formatPaymentMethod(row.payment_method)}</td>
            <td className="px-4 py-3 text-sm"><span className="rounded-full border border-white/10 px-2 py-1 text-xs">{formatStatus(row.status)}</span></td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                <Link to={`/sales/${row.id}`} title="View sale" className="text-dashboard-text-sub hover:text-dashboard-text-primary"><Eye size={18} /></Link>
                <button type="button" title="Print receipt" disabled={printingId === row.id} onClick={() => void onPrint(row)} className="text-dashboard-text-sub hover:text-dashboard-text-primary disabled:opacity-40"><Printer size={18} /></button>
              </div>
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
