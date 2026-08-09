import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Eye, Printer, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SaleWithRelations } from '../services/salesService';
import * as salesService from '../services/salesService';
import * as settingsService from '../services/settingsService';
import type { StoreSettings } from '../types';
import { Alert, DataTable, Input, LoadingSpinner, PageHeader } from '../components/ui';
import { ThermalReceipt } from '../components/receipt/ThermalReceipt';
import { useAuth } from '../context/AuthContext';
import { printReceipt } from '../services/receiptPrintService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';

export function Sales() {
  const { profile } = useAuth();
  const [sales, setSales] = useState<SaleWithRelations[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [salesResult, settingsResult] = await Promise.all([
      salesService.getSales(),
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
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sales;
    return sales.filter((sale) =>
      (sale.invoice_number || '').toLowerCase().includes(query) ||
      (sale.customer?.name || 'walk-in customer').toLowerCase().includes(query) ||
      (sale.cashier?.full_name || '').toLowerCase().includes(query)
    );
  }, [sales, search]);

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

      <div className="glass-card p-4">
        <div className="relative z-10 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by invoice, customer, or cashier"
            className="pl-10"
          />
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
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={filteredSales.length === 0}
          emptyMessage="No sales found."
        >
          {filteredSales.map((sale) => (
            <tr key={sale.id} className="hover:bg-dashboard-hover">
              <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">{sale.invoice_number || sale.id.slice(0, 8)}</td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(sale.created_at)}</td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{sale.customer?.name || 'Walk-in Customer'}</td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">{sale.cashier?.full_name || 'Unknown'}</td>
              <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">{formatCurrency(Number(sale.total_amount))}</td>
              <td className="px-6 py-4 text-sm capitalize text-dashboard-text-sub">{sale.payment_method.replace('_', ' ')}</td>
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
          ))}
        </DataTable>
      )}
    </div>
  );
}
