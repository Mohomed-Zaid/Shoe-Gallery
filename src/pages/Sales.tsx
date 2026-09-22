import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Eye, Printer, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SaleWithRelations } from '../services/salesService';
import * as salesService from '../services/salesService';
import * as settingsService from '../services/settingsService';
import type { StoreSettings } from '../types';
import { Alert, Button, DataTable, Input, LoadingSpinner, PageHeader } from '../components/ui';
import { ThermalReceipt } from '../components/receipt/ThermalReceipt';
import { useAuth } from '../context/AuthContext';
import { printReceipt } from '../services/receiptPrintService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import { getCustomerSaleAmount } from '../utils/cardFee';

type SalesPeriod = 'today' | 'yesterday' | 'last7days' | 'thisMonth' | 'lastMonth' | 'allTime' | 'custom';

const PERIODS: Array<{ value: SalesPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'allTime', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function businessMidnightUtc(date: string) {
  // The app's Colombo business timezone is UTC+05:30 year-round.
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

function getPeriodRange(period: SalesPeriod, fromDate: string, toDate: string) {
  if (period === 'allTime') return {};
  const today = businessDate();
  let from = today;
  let through = today;

  if (period === 'yesterday') from = through = addDays(today, -1);
  if (period === 'last7days') from = addDays(today, -6);
  if (period === 'thisMonth') from = startOfMonth(today);
  if (period === 'lastMonth') {
    const previousMonthLastDay = addDays(startOfMonth(today), -1);
    from = startOfMonth(previousMonthLastDay);
    through = previousMonthLastDay;
  }
  if (period === 'custom') {
    from = fromDate;
    through = toDate;
  }

  return {
    createdFrom: businessMidnightUtc(from),
    // Exclusive next midnight includes every millisecond of the final calendar day.
    createdBefore: businessMidnightUtc(addDays(through, 1)),
  };
}

function statusLabel(status: SaleWithRelations['status']) {
  if (status === 'partially_returned') return 'Partially Returned';
  if (status === 'fully_returned') return 'Returned';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: SaleWithRelations['status']) {
  if (status === 'cancelled') return 'border-red-400/30 bg-red-500/10 text-red-300';
  if (status === 'fully_returned') return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
  if (status === 'partially_returned') return 'border-blue-400/30 bg-blue-500/10 text-blue-200';
  return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
}

function periodButtonClass(active: boolean) {
  const base = 'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors';
  return active
    ? base + ' border-dashboard-accent bg-dashboard-accent text-white shadow-glass-glow'
    : base + ' border-white/15 bg-white/[0.06] text-dashboard-text-sub hover:border-dashboard-accent/50 hover:text-dashboard-text-primary';
}

type SaleStatusFilter = 'all' | 'completed' | 'returned' | 'cancelled';

function getSaleReturnedAmount(sale: SaleWithRelations): number {
  if (sale.status === 'fully_returned') {
    return getCustomerSaleAmount(sale.total_amount, sale.card_payment_fee);
  }
  if (!sale.sales_returns || sale.sales_returns.length === 0) {
    return 0;
  }
  const completedReturns = sale.sales_returns.filter((r) => r.status === 'completed');
  const returnItemsTotal = completedReturns.reduce(
    (sum, r) => sum + (r.sales_return_items ?? []).reduce((iSum, item) => iSum + Number(item.return_total || 0), 0),
    0,
  );
  if (returnItemsTotal > 0) return returnItemsTotal;
  return completedReturns.reduce((sum, r) => sum + Number(r.refund_amount || 0) + Number(r.store_credit_amount || 0), 0);
}

function getSaleNetAmount(sale: SaleWithRelations): number {
  if (sale.status === 'cancelled') return 0;
  const original = getCustomerSaleAmount(sale.total_amount, sale.card_payment_fee);
  if (sale.status === 'fully_returned') return 0;
  if (sale.status === 'partially_returned') {
    const returned = getSaleReturnedAmount(sale);
    return Math.max(0, original - returned);
  }
  return original;
}

export function Sales() {
  const { profile } = useAuth();
  const [sales, setSales] = useState<SaleWithRelations[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SaleStatusFilter>('all');
  const initialBusinessDate = useMemo(() => businessDate(), []);
  const [period, setPeriod] = useState<SalesPeriod>('today');
  const [fromDate, setFromDate] = useState(initialBusinessDate);
  const [toDate, setToDate] = useState(initialBusinessDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [salesResult, settingsResult] = await Promise.all([
      salesService.getSales(getPeriodRange(period, fromDate, toDate)),
      settingsService.getStoreSettings(),
    ]);
    if (salesResult.error) {
      setError(getErrorMessage(salesResult.error));
    } else {
      setSales((salesResult.data as SaleWithRelations[]) ?? []);
    }
    if (settingsResult.error) {
      setError(getErrorMessage(settingsResult.error));
    } else {
      setSettings(settingsResult.data as StoreSettings | null);
    }
    setLoading(false);
  }, [fromDate, period, toDate]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const statusCounts = useMemo(() => {
    return {
      all: sales.length,
      completed: sales.filter((s) => s.status === 'completed' || s.status === 'partially_returned').length,
      returned: sales.filter((s) => s.status === 'fully_returned').length,
      cancelled: sales.filter((s) => s.status === 'cancelled').length,
    };
  }, [sales]);

  const filteredSales = useMemo(() => {
    let result = sales;
    if (statusFilter === 'completed') {
      result = result.filter((s) => s.status === 'completed' || s.status === 'partially_returned');
    } else if (statusFilter === 'returned') {
      result = result.filter((s) => s.status === 'fully_returned' || s.status === 'partially_returned');
    } else if (statusFilter === 'cancelled') {
      result = result.filter((s) => s.status === 'cancelled');
    }

    const query = search.trim().toLowerCase();
    if (!query) return result;
    return result.filter((sale) =>
      (sale.invoice_number || '').toLowerCase().includes(query) ||
      (sale.customer?.name || 'walk-in customer').toLowerCase().includes(query) ||
      (sale.cashier?.full_name || '').toLowerCase().includes(query)
    );
  }, [sales, search, statusFilter]);

  const filteredNetTotal = useMemo(
    () => filteredSales.reduce((sum, sale) => sum + getSaleNetAmount(sale), 0),
    [filteredSales],
  );

  const completedSalesCount = useMemo(
    () => filteredSales.filter((s) => s.status === 'completed' || s.status === 'partially_returned').length,
    [filteredSales],
  );

  const returnedSalesCount = useMemo(
    () => filteredSales.filter((s) => s.status === 'fully_returned').length,
    [filteredSales],
  );

  const cancelledSalesCount = useMemo(
    () => filteredSales.filter((s) => s.status === 'cancelled').length,
    [filteredSales],
  );

  const activePeriodLabel = PERIODS.find((option) => option.value === period)?.label ?? 'Selected period';
  const emptyMessage = search.trim()
    ? 'No sales match your search.'
    : statusFilter !== 'all'
    ? `No ${statusFilter} sales found for the selected period.`
    : period === 'today'
    ? 'No sales found for today.'
    : 'No sales found for the selected period.';

  const handleCancel = async (sale: SaleWithRelations) => {
    if (!confirm(`Cancel ${sale.invoice_number || sale.id}?`)) return;
    try {
      await salesService.cancelSale(sale.id);
      fetchSales();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handlePrint = (sale: SaleWithRelations) => {
    try {
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
    } catch (printError) {
      setError(getErrorMessage(printError, 'Unable to open receipt print window.'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Track invoices, print receipts, and manage completed sales."
      />

      {error && <Alert message={error} />}

      <div className='glass-card p-4'>
        <div className='flex flex-wrap gap-2' aria-label='Sales date range'>
          {PERIODS.map((option) => (
            <button key={option.value} type='button' aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)} className={periodButtonClass(period === option.value)}>
              {option.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className='mt-3 flex flex-wrap gap-3'>
            <label className='text-sm font-medium text-dashboard-text-label'>
              <span className='mb-1 block'>From Date</span>
              <Input type='date' aria-label='From date' value={fromDate} max={toDate}
                onChange={(event) => event.target.value && setFromDate(event.target.value)} className='w-auto min-w-40' />
            </label>
            <label className='text-sm font-medium text-dashboard-text-label'>
              <span className='mb-1 block'>To Date</span>
              <Input type='date' aria-label='To date' value={toDate} min={fromDate}
                onChange={(event) => event.target.value && setToDate(event.target.value)} className='w-auto min-w-40' />
            </label>
          </div>
        )}

        <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashboard-border pt-3'>
          <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium text-dashboard-text-primary'>{activePeriodLabel}</span>
              <span className='text-dashboard-text-sub'>·</span>
              <span className='text-dashboard-text-sub'>
                Sales: <span className='font-semibold text-dashboard-text-primary'>{completedSalesCount}</span>
              </span>
              {returnedSalesCount > 0 && (
                <span className='inline-flex items-center rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200'>
                  {returnedSalesCount} Returned
                </span>
              )}
              {cancelledSalesCount > 0 && (
                <span className='inline-flex items-center rounded-md border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300'>
                  {cancelledSalesCount} Cancelled
                </span>
              )}
            </div>
            <p className='text-dashboard-text-sub'>
              Total: <span className='font-semibold text-emerald-300'>{formatCurrency(filteredNetTotal)}</span>
            </p>
          </div>
          <Button variant='secondary' size='sm' onClick={() => void fetchSales()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative z-10 max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by invoice, customer, or cashier"
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by invoice status">
            {(['all', 'completed', 'returned', 'cancelled'] as const).map((statusKey) => {
              const label = statusKey === 'all' ? 'All' : statusKey.charAt(0).toUpperCase() + statusKey.slice(1);
              const count = statusCounts[statusKey];
              const active = statusFilter === statusKey;
              return (
                <button
                  key={statusKey}
                  type="button"
                  onClick={() => setStatusFilter(statusKey)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border border-dashboard-accent bg-dashboard-accent text-white shadow-glass-glow'
                      : 'border border-white/10 bg-white/[0.04] text-dashboard-text-sub hover:border-white/20 hover:text-dashboard-text-primary'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'invoice', header: 'Invoice Number' },
            { key: 'date', header: 'Date' },
            { key: 'customer', header: 'Customer' },
            { key: 'cashier', header: 'Cashier' },
            { key: 'total', header: 'Total' },
            { key: 'payment', header: 'Payment' },
            { key: 'status', header: 'Status' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={filteredSales.length === 0}
          emptyMessage={emptyMessage}
        >
          {filteredSales.map((sale) => {
            const originalAmount = getCustomerSaleAmount(sale.total_amount, sale.card_payment_fee);
            const netAmount = getSaleNetAmount(sale);
            return (
              <tr key={sale.id} className="hover:bg-dashboard-hover">
                <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">{sale.invoice_number || sale.id.slice(0, 8)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(sale.created_at)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{sale.customer?.name || 'Walk-in Customer'}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{sale.cashier?.full_name || 'Unknown'}</td>
                <td className="px-6 py-4 text-sm">
                  {sale.status === 'cancelled' ? (
                    <div className="flex flex-col">
                      <span className="font-medium text-dashboard-text-sub/60 line-through" title="Cancelled sale (voided)">
                        {formatCurrency(originalAmount)}
                      </span>
                      <span className="text-[11px] text-red-300">Voided (LKR 0.00)</span>
                    </div>
                  ) : sale.status === 'fully_returned' ? (
                    <div className="flex flex-col">
                      <span className="font-medium text-dashboard-text-sub/60 line-through" title="Fully returned invoice">
                        {formatCurrency(originalAmount)}
                      </span>
                      <span className="text-[11px] text-amber-300">Returned (LKR 0.00)</span>
                    </div>
                  ) : sale.status === 'partially_returned' ? (
                    <div className="flex flex-col">
                      <span className="font-medium text-dashboard-text-primary">
                        {formatCurrency(netAmount)}
                      </span>
                      <span className="text-[11px] text-dashboard-text-sub">
                        orig: {formatCurrency(originalAmount)}
                      </span>
                    </div>
                  ) : (
                    <span className="font-medium text-dashboard-text-primary">
                      {formatCurrency(originalAmount)}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm capitalize text-dashboard-text-sub">{sale.payment_method.replace('_', ' ')}</td>
                <td className="px-6 py-4 text-sm">
                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(sale.status)}`}>
                    {statusLabel(sale.status)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-3">
                    <Link to={`/sales/${sale.id}`} className="text-dashboard-text-sub hover:text-dashboard-text-primary">
                      <Eye size={18} />
                    </Link>
                    <button
                      type="button"
                      title="Print receipt"
                      className="text-dashboard-text-sub hover:text-dashboard-text-primary"
                      onClick={() => handlePrint(sale)}
                    >
                      <Printer size={18} />
                    </button>
                    {profile?.role === 'admin' && sale.status !== 'cancelled' && (
                      <button type="button" className="text-red-400 hover:text-red-300" onClick={() => void handleCancel(sale)}>
                        <Ban size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
