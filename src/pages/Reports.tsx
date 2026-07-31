import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Filter } from 'lucide-react';
import * as reportService from '../services/reportService';
import type { DateRange, ReportRange, ReportsBundle } from '../services/reportService';
import { Alert, Button, Input, LoadingSpinner, PageHeader, Select } from '../components/ui';
import { formatCurrency, formatDate } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildCsv(bundle: ReportsBundle) {
  const rows: Array<(string | number)[]> = [
    ['Section', 'Label', 'Value'],
    ['Sales', 'Total Sales', bundle.salesSummary.sales],
    ['Sales', 'Orders', bundle.salesSummary.orders],
    ['Sales', 'Average Sale', bundle.salesSummary.averageSale],
    ['Sales', 'Profit', bundle.salesSummary.profit],
    ['Inventory', 'Current Stock', bundle.inventorySummary.currentStock],
    ['Inventory', 'Low Stock', bundle.inventorySummary.lowStock],
    ['Inventory', 'Out of Stock', bundle.inventorySummary.outOfStock],
    ['Inventory', 'Stock Value', bundle.inventorySummary.stockValue],
    [],
    ['Best Selling Products', 'Qty'],
    ...bundle.productSummary.bestSelling.map((p) => [p.label, p.quantity]),
    [],
    ['Slow Moving Products', 'Qty'],
    ...bundle.productSummary.slowMoving.map((p) => [p.label, p.quantity]),
    [],
    ['Most Profitable Products', 'Amount'],
    ...bundle.productSummary.mostProfitable.map((p) => [p.label, p.amount]),
    [],
    ['Top Customers', 'Amount'],
    ...bundle.customerSummary.topCustomers.map((c) => [c.label, c.amount]),
    [],
    ['Outstanding Customers', 'Amount'],
    ...bundle.customerSummary.outstandingCustomers.map((c) => [c.label, c.amount]),
    [],
    ['Supplier Purchases', 'Amount'],
    ...bundle.supplierSummary.purchases.map((s) => [s.label, s.amount]),
    [],
    ['Supplier Outstanding', 'Amount'],
    ...bundle.supplierSummary.outstandingPayments.map((s) => [s.label, s.amount]),
  ];
  return rows.map((row) => row.join(',')).join('\n');
}

function getRangeLabel(range: ReportRange, custom: DateRange) {
  switch (range) {
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'this_week': return 'This Week';
    case 'this_month': return 'This Month';
    case 'custom': return `${custom.from} to ${custom.to}`;
    default: return '';
  }
}

/* ─── Print-only Table Component ────────────────────────────────────────── */
function ReportTable({ headers, rows, caption }: {
  headers: string[];
  rows: Array<(string | number)[]>;
  caption?: string;
}) {
  if (rows.length === 0) return <p className="report-muted">No data available.</p>;
  return (
    <table className="report-table">
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Reports Page ────────────────────────────────────────────────────── */
export function Reports() {
  const [range, setRange] = useState<ReportRange>('this_month');
  const [customRange, setCustomRange] = useState<DateRange>({
    from: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const [data, setData] = useState<ReportsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await reportService.getReportsBundle(
        range,
        range === 'custom'
          ? {
              from: `${customRange.from}T00:00:00.000Z`,
              to: `${customRange.to}T23:59:59.999Z`,
            }
          : undefined
      );
      setData(bundle);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [customRange.from, customRange.to, range]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Total Sales', value: formatCurrency(data.salesSummary.sales) },
      { label: 'Orders', value: String(data.salesSummary.orders) },
      { label: 'Average Sale', value: formatCurrency(data.salesSummary.averageSale) },
      { label: 'Profit', value: formatCurrency(data.salesSummary.profit) },
    ];
  }, [data]);

  const handlePrint = () => {
    window.print();
  };

  const rangeLabel = getRangeLabel(range, customRange);
  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* ─── Screen-only Header ─────────────────────────────────────── */}
      <div className="print-hidden">
        <PageHeader
          title="Reports"
          description="Sales, inventory, customer, supplier, and product performance reports."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => data && downloadFile('reports.csv', buildCsv(data), 'text/csv;charset=utf-8;')}>
                <Download size={16} />
                CSV
              </Button>
              <Button variant="secondary" onClick={() => data && downloadFile('reports.xls', buildCsv(data), 'application/vnd.ms-excel')}>
                <FileSpreadsheet size={16} />
                Excel
              </Button>
              <Button variant="secondary" onClick={handlePrint}>
                <FileText size={16} />
                PDF
              </Button>
            </div>
          }
        />
      </div>

      {error && <div className="print-hidden"><Alert message={error} /></div>}

      {/* ─── Screen-only Filters ─────────────────────────────────────── */}
      <div className="glass-card p-5 print-hidden">
        <div className="relative z-10 grid gap-4 md:grid-cols-[220px_1fr_1fr_auto]">
          <Select value={range} onChange={(event) => setRange(event.target.value as ReportRange)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="custom">Custom Range</option>
          </Select>
          <Input
            type="date"
            value={customRange.from}
            onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))}
            disabled={range !== 'custom'}
          />
          <Input
            type="date"
            value={customRange.to}
            onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))}
            disabled={range !== 'custom'}
          />
          <Button onClick={() => void fetchReports()}>
            <Filter size={16} />
            Apply
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* ─── Screen view (dark glass cards) ────────────────────────── */}
          <div className="print-hidden space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <div key={card.label} className="glass-card p-5">
                  <p className="relative z-10 text-xs uppercase tracking-wide text-dashboard-text-label">{card.label}</p>
                  <p className="relative z-10 mt-3 text-3xl font-bold text-dashboard-text-primary">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="glass-card p-5">
                <h3 className="relative z-10 mb-4 text-lg font-semibold text-dashboard-text-primary">Inventory Report</h3>
                <div className="relative z-10 space-y-3 text-sm">
                  <div className="flex justify-between text-dashboard-text-sub"><span>Current Stock</span><span>{data.inventorySummary.currentStock}</span></div>
                  <div className="flex justify-between text-dashboard-text-sub"><span>Low Stock</span><span>{data.inventorySummary.lowStock}</span></div>
                  <div className="flex justify-between text-dashboard-text-sub"><span>Out of Stock</span><span>{data.inventorySummary.outOfStock}</span></div>
                  <div className="flex justify-between font-medium text-dashboard-text-primary"><span>Stock Value</span><span>{formatCurrency(data.inventorySummary.stockValue)}</span></div>
                </div>
              </div>

              <div className="glass-card p-5">
                <h3 className="relative z-10 mb-4 text-lg font-semibold text-dashboard-text-primary">Customer Report</h3>
                <div className="relative z-10 space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Top Customers</p>
                    <div className="space-y-2">
                      {data.customerSummary.topCustomers.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Outstanding Customers</p>
                    <div className="space-y-2">
                      {data.customerSummary.outstandingCustomers.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="glass-card p-5">
                <h3 className="relative z-10 mb-4 text-lg font-semibold text-dashboard-text-primary">Product Report</h3>
                <div className="relative z-10 grid gap-5 md:grid-cols-3">
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Best Selling</p>
                    <div className="space-y-2">
                      {data.productSummary.bestSelling.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Slow Moving</p>
                    <div className="space-y-2">
                      {data.productSummary.slowMoving.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Most Profitable</p>
                    <div className="space-y-2">
                      {data.productSummary.mostProfitable.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-card p-5">
                <h3 className="relative z-10 mb-4 text-lg font-semibold text-dashboard-text-primary">Supplier Report</h3>
                <div className="relative z-10 grid gap-5 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Purchases</p>
                    <div className="space-y-2">
                      {data.supplierSummary.purchases.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-dashboard-text-primary">Outstanding Payments</p>
                    <div className="space-y-2">
                      {data.supplierSummary.outstandingPayments.map((item) => (
                        <div key={item.label} className="flex justify-between text-sm text-dashboard-text-sub">
                          <span>{item.label}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <h3 className="relative z-10 mb-4 text-lg font-semibold text-dashboard-text-primary">Purchase History</h3>
              <div className="relative z-10 space-y-3">
                {data.customerSummary.purchaseHistory.map((sale) => (
                  <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div>
                      <p className="font-medium text-dashboard-text-primary">{sale.invoice_number || sale.id.slice(0, 8)}</p>
                      <p className="text-xs text-dashboard-text-sub">{sale.customer?.name || 'Walk-in Customer'} • {formatDate(sale.created_at)}</p>
                    </div>
                    <div className="text-sm font-medium text-dashboard-text-primary">{formatCurrency(Number(sale.total_amount))}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Print-only structured PDF view ──────────────────────────── */}
          <div ref={printRef} className="report-print-area">
            {/* Cover header */}
            <div className="report-header">
              <h1>Shoe Gallery</h1>
              <h2>Business Report</h2>
              <p className="report-meta">Period: {rangeLabel} &nbsp;|&nbsp; Generated: {generatedAt}</p>
            </div>

            {/* 1. Sales Summary */}
            <div className="report-section">
              <h3>1. Sales Summary</h3>
              <div className="report-kpi-grid">
                <div className="report-kpi"><span className="report-kpi-label">Total Sales</span><span className="report-kpi-value">{formatCurrency(data.salesSummary.sales)}</span></div>
                <div className="report-kpi"><span className="report-kpi-label">Orders</span><span className="report-kpi-value">{data.salesSummary.orders}</span></div>
                <div className="report-kpi"><span className="report-kpi-label">Average Sale</span><span className="report-kpi-value">{formatCurrency(data.salesSummary.averageSale)}</span></div>
                <div className="report-kpi"><span className="report-kpi-label">Profit</span><span className="report-kpi-value">{formatCurrency(data.salesSummary.profit)}</span></div>
              </div>
            </div>

            {/* 2. Inventory Summary */}
            <div className="report-section">
              <h3>2. Inventory Summary</h3>
              <div className="report-kpi-grid">
                <div className="report-kpi"><span className="report-kpi-label">Current Stock</span><span className="report-kpi-value">{data.inventorySummary.currentStock}</span></div>
                <div className="report-kpi"><span className="report-kpi-label">Low Stock</span><span className="report-kpi-value">{data.inventorySummary.lowStock}</span></div>
                <div className="report-kpi"><span className="report-kpi-label">Out of Stock</span><span className="report-kpi-value">{data.inventorySummary.outOfStock}</span></div>
                <div className="report-kpi"><span className="report-kpi-label">Stock Value</span><span className="report-kpi-value">{formatCurrency(data.inventorySummary.stockValue)}</span></div>
              </div>
            </div>

            {/* 3. Product Performance */}
            <div className="report-section">
              <h3>3. Product Performance</h3>
              <div className="report-tables-row">
                <ReportTable
                  caption="Best Selling"
                  headers={['Product', 'Qty']}
                  rows={data.productSummary.bestSelling.map((p) => [p.label, p.quantity])}
                />
                <ReportTable
                  caption="Slow Moving"
                  headers={['Product', 'Qty']}
                  rows={data.productSummary.slowMoving.map((p) => [p.label, p.quantity])}
                />
                <ReportTable
                  caption="Most Profitable"
                  headers={['Product', 'Profit']}
                  rows={data.productSummary.mostProfitable.map((p) => [p.label, formatCurrency(p.amount)])}
                />
              </div>
            </div>

            {/* 4. Customer Report */}
            <div className="report-section">
              <h3>4. Customer Report</h3>
              <div className="report-tables-row">
                <ReportTable
                  caption="Top Customers"
                  headers={['Customer', 'Amount']}
                  rows={data.customerSummary.topCustomers.map((c) => [c.label, formatCurrency(c.amount)])}
                />
                <ReportTable
                  caption="Outstanding Balances"
                  headers={['Customer', 'Balance']}
                  rows={data.customerSummary.outstandingCustomers.map((c) => [c.label, formatCurrency(c.amount)])}
                />
              </div>
            </div>

            {/* 5. Supplier Report */}
            <div className="report-section">
              <h3>5. Supplier Report</h3>
              <div className="report-tables-row">
                <ReportTable
                  caption="Purchases"
                  headers={['Supplier', 'Amount']}
                  rows={data.supplierSummary.purchases.map((s) => [s.label, formatCurrency(s.amount)])}
                />
                <ReportTable
                  caption="Outstanding Payments"
                  headers={['Supplier', 'Amount']}
                  rows={data.supplierSummary.outstandingPayments.map((s) => [s.label, formatCurrency(s.amount)])}
                />
              </div>
            </div>

            {/* 6. Recent Purchase History */}
            <div className="report-section">
              <h3>6. Recent Purchase History</h3>
              <ReportTable
                headers={['Invoice', 'Customer', 'Date', 'Amount']}
                rows={data.customerSummary.purchaseHistory.map((s) => [
                  s.invoice_number || s.id.slice(0, 8),
                  s.customer?.name || 'Walk-in',
                  formatDate(s.created_at),
                  formatCurrency(Number(s.total_amount)),
                ])}
              />
            </div>

            {/* Footer */}
            <div className="report-footer">
              <p>This report was automatically generated by Shoe Gallery POS.</p>
              <p>Confidential — For internal use only.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
