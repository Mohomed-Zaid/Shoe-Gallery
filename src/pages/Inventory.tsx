import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { ProductVariant, Product } from '../types';
import * as productService from '../services/productService';
import * as inventoryService from '../services/inventoryService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import {
  Alert,
  Button,
  DataTable,
  Input,
  LoadingSpinner,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';

interface VariantWithProduct extends ProductVariant {
  product: Product & {
    category?: { name: string } | null;
    brand?: { name: string } | null;
  };
}

interface AdjustmentFormInputs {
  variant_id: string;
  change_type: 'add' | 'remove';
  quantity: number;
  reason: string;
}

export function Inventory() {
  const [variants, setVariants] = useState<VariantWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AdjustmentFormInputs>();

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await productService.getAllProductVariants();
    if (fetchError) {
      setError(getErrorMessage(fetchError));
    } else {
      setVariants((data as VariantWithProduct[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const closeModal = () => {
    setShowModal(false);
    reset();
  };

  const onSubmit = async (data: AdjustmentFormInputs) => {
    setError(null);
    try {
      await inventoryService.adjustStock(
        data.variant_id,
        data.change_type,
        data.quantity,
        data.reason
      );
      closeModal();
      fetchInventory();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const getStockStatus = (stock: number) => {
    if (stock <= 0) return { label: 'Out of Stock', class: 'bg-red-500/20 text-red-300' };
    if (stock < 10) return { label: 'Low Stock', class: 'bg-yellow-500/20 text-yellow-300' };
    return { label: 'Available', class: 'bg-green-500/20 text-green-300' };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Manage your inventory stock levels"
        action={
          <Button onClick={() => setShowModal(true)}>
            <Plus size={20} />
            Adjust Stock
          </Button>
        }
      />

      {error && <Alert message={error} />}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'product', header: 'Product' },
            { key: 'size', header: 'Size' },
            { key: 'color', header: 'Color' },
            { key: 'stock', header: 'Current Stock' },
            { key: 'cost', header: 'Cost Price' },
            { key: 'price', header: 'Selling Price' },
            { key: 'value', header: 'Stock Value' },
            { key: 'status', header: 'Status' },
          ]}
          isEmpty={variants.length === 0}
          emptyMessage="No inventory items found"
        >
          {variants.map((variant) => {
            const status = getStockStatus(variant.stock_quantity);
            const stockValue = variant.stock_quantity * variant.cost_price;
            return (
              <tr key={variant.id} className="hover:bg-dashboard-hover">
                <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                  {variant.product.name}
                </td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{variant.size}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{variant.color}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-primary">{variant.stock_quantity}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{formatCurrency(variant.cost_price)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{formatCurrency(variant.selling_price)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-primary">{formatCurrency(stockValue)}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.class}`}>
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {showModal && (
        <Modal title="Adjust Stock" onClose={closeModal} size="md">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Select
              id="variant_id"
              label="Product Variant"
              error={errors.variant_id?.message}
              {...register('variant_id', { required: 'Variant is required' })}
            >
              <option value="">Select a variant</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.product.name} - {variant.size} / {variant.color}
                </option>
              ))}
            </Select>

            <Select
              id="change_type"
              label="Adjustment Type"
              error={errors.change_type?.message}
              {...register('change_type', { required: 'Type is required' })}
            >
              <option value="add">Add Stock</option>
              <option value="remove">Remove Stock</option>
            </Select>

            <Input
              id="quantity"
              type="number"
              label="Quantity"
              error={errors.quantity?.message}
              {...register('quantity', { required: 'Quantity is required', min: 1 })}
            />

            <Textarea
              id="reason"
              label="Reason"
              rows={3}
              placeholder="e.g., Damaged, Lost, Manual Correction"
              {...register('reason')}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Saving...' : 'Adjust'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
