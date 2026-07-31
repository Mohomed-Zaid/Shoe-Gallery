import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import type { Purchase, Supplier, ProductVariant, Product } from '../types';
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

interface PurchaseWithRelations extends Purchase {
  supplier: Supplier | null;
  purchase_items: (Purchase & {
    variant: ProductVariant & {
      product: Product;
    };
  })[];
}

export function Purchases() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<PurchaseWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await purchaseService.getPurchases();
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setPurchases((data as PurchaseWithRelations[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Track and manage your purchases"
        action={
          <Button onClick={() => navigate('/purchases/create')}>
            <Plus size={20} />
            Add Purchase
          </Button>
        }
      />

      {error && <Alert message={error} />}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'id', header: 'Purchase #' },
            { key: 'supplier', header: 'Supplier' },
            { key: 'date', header: 'Date' },
            { key: 'total', header: 'Total Amount' },
            { key: 'status', header: 'Status' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={purchases.length === 0}
          emptyMessage="No purchases found"
        >
          {purchases.map((purchase) => (
            <tr key={purchase.id} className="hover:bg-dashboard-hover">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                #{purchase.id.slice(0, 8)}
              </td>
              <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                {purchase.supplier?.name || '-'}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">
                {formatDate(purchase.purchase_date)}
              </td>
              <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                {formatCurrency(purchase.total_amount)}
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(purchase.payment_status)}`}>
                  {purchase.payment_status}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                <Link to={`/purchases/${purchase.id}`} className="text-dashboard-text-sub hover:text-dashboard-text-primary">
                  <Eye size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
