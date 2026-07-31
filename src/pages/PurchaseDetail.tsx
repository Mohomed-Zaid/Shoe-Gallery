import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Supplier, ProductVariant, Product } from '../types';
import * as purchaseService from '../services/purchaseService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import {
  Alert,
  Button,
  DataTable,
  LoadingSpinner,
  PageHeader,
} from '../components/ui';

interface PurchaseItem {
  id: string;
  variant: ProductVariant & { product: Product };
  quantity: number;
  cost_price: number;
}

interface PurchaseWithRelations {
  id: string;
  supplier: Supplier | null;
  purchase_date: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
  purchase_items: PurchaseItem[];
}

export function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [purchase, setPurchase] = useState<PurchaseWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPurchase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await purchaseService.getPurchaseById(id);
      if (fetchError) throw fetchError;
      if (!data) throw new Error('Purchase not found');
      setPurchase(data as PurchaseWithRelations);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPurchase();
  }, [fetchPurchase]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-500/20 text-green-300';
      case 'partial':
        return 'bg-yellow-500/20 text-yellow-300';
      case 'unpaid':
      default:
        return 'bg-red-500/20 text-red-300';
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!purchase) return <Alert message={error ?? 'Purchase not found'} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Purchase #${purchase.id.slice(0, 8)}`}
        description="Purchase details"
        action={
          <Link to="/purchases">
            <Button variant="secondary">
              <ArrowLeft size={18} />
              Back to Purchases
            </Button>
          </Link>
        }
      />

      {error && <Alert message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">Purchase Info</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Supplier</dt>
              <dd className="font-medium text-dashboard-text-primary">{purchase.supplier?.name || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Purchase Date</dt>
              <dd className="font-medium text-dashboard-text-primary">{formatDate(purchase.purchase_date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Total Amount</dt>
              <dd className="font-medium text-dashboard-text-primary">{formatCurrency(purchase.total_amount)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-dashboard-text-label">Status</dt>
              <dd>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(purchase.payment_status)}`}>
                  {purchase.payment_status}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-2">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-dashboard-text-primary mb-4">Purchase Items</h3>
            <DataTable
              columns={[
                { key: 'product', header: 'Product' },
                { key: 'size', header: 'Size' },
                { key: 'color', header: 'Color' },
                { key: 'quantity', header: 'Quantity' },
                { key: 'cost_price', header: 'Cost Price' },
                { key: 'total', header: 'Total' },
              ]}
              isEmpty={purchase.purchase_items.length === 0}
              emptyMessage="No items found for this purchase"
            >
              {purchase.purchase_items.map((item) => (
                <tr key={item.id} className="hover:bg-dashboard-hover">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                    {item.variant.product.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">
                    {item.variant.size}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">
                    {item.variant.color}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-primary">
                    {item.quantity}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">
                    {formatCurrency(item.cost_price)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                    {formatCurrency(item.quantity * item.cost_price)}
                  </td>
                </tr>
              ))}
            </DataTable>

            <div className="flex justify-end pt-4 border-t border-white/10">
              <div className="text-right">
                <div className="text-sm text-dashboard-text-sub">Total Amount</div>
                <div className="text-2xl font-bold text-dashboard-text-primary">{formatCurrency(purchase.total_amount)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
