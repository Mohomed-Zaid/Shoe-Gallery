import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { CustomerProfile } from '../services/customerService';
import * as customerService from '../services/customerService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import { Alert, Button, DataTable, LoadingSpinner, PageHeader } from '../components/ui';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await customerService.getCustomerById(id);
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setCustomer(data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  if (loading) return <LoadingSpinner />;
  if (!customer) return <Alert message={error ?? 'Customer not found.'} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description="Customer profile and purchase history"
        action={
          <Link to="/customers">
            <Button variant="secondary">
              <ArrowLeft size={16} />
              Back
            </Button>
          </Link>
        }
      />

      {error && <Alert message={error} />}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="glass-card p-6 xl:col-span-1">
          <div className="relative z-10 space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dashboard-accent/20 text-dashboard-text-primary">
              <Receipt size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-dashboard-text-primary">{customer.name}</h2>
              <p className="mt-1 text-sm text-dashboard-text-sub">{customer.email || 'No email address'}</p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-dashboard-text-sub">Phone: <span className="text-dashboard-text-primary">{customer.phone || '-'}</span></p>
              <p className="text-dashboard-text-sub">Address: <span className="text-dashboard-text-primary">{customer.address || '-'}</span></p>
              <p className="text-dashboard-text-sub">Notes: <span className="text-dashboard-text-primary">{customer.notes || '-'}</span></p>
              <p className="text-dashboard-text-sub">Joined: <span className="text-dashboard-text-primary">{formatDate(customer.created_at)}</span></p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:col-span-2">
          <div className="glass-card p-5">
            <p className="relative z-10 text-xs uppercase tracking-wide text-dashboard-text-label">Total Purchases</p>
            <p className="relative z-10 mt-3 text-3xl font-bold text-dashboard-text-primary">{customer.total_purchases}</p>
          </div>
          <div className="glass-card p-5">
            <p className="relative z-10 text-xs uppercase tracking-wide text-dashboard-text-label">Total Spent</p>
            <p className="relative z-10 mt-3 text-3xl font-bold text-dashboard-text-primary">{formatCurrency(customer.total_amount_spent)}</p>
          </div>
          <div className="glass-card p-5">
            <p className="relative z-10 text-xs uppercase tracking-wide text-dashboard-text-label">Outstanding Balance</p>
            <p className="relative z-10 mt-3 text-3xl font-bold text-dashboard-text-primary">{formatCurrency(Number(customer.outstanding_balance ?? 0))}</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="relative z-10">
          <h3 className="mb-4 text-lg font-semibold text-dashboard-text-primary">Recent Purchases</h3>
          <DataTable
            columns={[
              { key: 'invoice', header: 'Invoice' },
              { key: 'date', header: 'Date' },
              { key: 'items', header: 'Items' },
              { key: 'payment', header: 'Payment' },
              { key: 'total', header: 'Total' },
            ]}
            isEmpty={customer.recent_purchases.length === 0}
            emptyMessage="No purchases found for this customer."
          >
            {customer.recent_purchases.map((sale) => (
              <tr key={sale.id} className="hover:bg-dashboard-hover">
                <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">{sale.invoice_number || sale.id.slice(0, 8)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(sale.created_at)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{sale.sale_items.length}</td>
                <td className="px-6 py-4 text-sm capitalize text-dashboard-text-sub">{sale.payment_method.replace('_', ' ')}</td>
                <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">{formatCurrency(Number(sale.total_amount))}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      </div>
    </div>
  );
}
