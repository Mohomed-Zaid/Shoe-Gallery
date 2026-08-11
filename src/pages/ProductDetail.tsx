import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Product, ProductVariant, Category, Brand } from '../types';
import * as productService from '../services/productService';
import * as categoryService from '../services/categoryService';
import * as brandService from '../services/brandService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import {
  Alert,
  Button,
  DataTable,
  Input,
  LoadingSpinner,
  Modal,
  PageHeader,
} from '../components/ui';

interface VariantFormInputs {
  size: string;
  color: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<VariantFormInputs>();

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [productRes, variantsRes, categoriesRes, brandsRes] = await Promise.all([
      productService.getProductById(id),
      productService.getProductVariants(id),
      categoryService.getCategories(),
      brandService.getBrands(),
    ]);

    if (productRes.error || !productRes.data) {
      setError(getErrorMessage(productRes.error, 'Product not found'));
      setLoading(false);
      return;
    }

    const productData = productRes.data as Product;
    setProduct(productData);
    setVariants((variantsRes.data as ProductVariant[]) ?? []);

    const categories = (categoriesRes.data as Category[]) ?? [];
    const brands = (brandsRes.data as Brand[]) ?? [];
    setCategory(categories.find((c) => c.id === productData.category_id) ?? null);
    setBrand(brands.find((b) => b.id === productData.brand_id) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const closeModal = () => {
    setShowModal(false);
    setEditingVariantId(null);
    reset();
  };

  const onSubmit = async (data: VariantFormInputs) => {
    if (!id) return;
    setError(null);

    const variantValues = {
      size: data.size,
      color: data.color,
      cost_price: Number(data.cost_price),
      selling_price: Number(data.selling_price),
      stock_quantity: Number(data.stock_quantity),
    };

    const result = editingVariantId
      ? await productService.updateVariant(editingVariantId, variantValues)
      : await productService.createVariant({ product_id: id, ...variantValues });

    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }

    closeModal();
    fetchData();
  };

  const handleEditVariant = (variant: ProductVariant) => {
    setEditingVariantId(variant.id);
    reset({
      size: variant.size,
      color: variant.color,
      cost_price: variant.cost_price ?? undefined,
      selling_price: variant.selling_price ?? undefined,
      stock_quantity: variant.stock_quantity,
    });
    setShowModal(true);
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Delete this variant?')) return;
    const { error: deleteError } = await productService.deleteVariant(variantId);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }
    fetchData();
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <Alert message={error ?? 'Product not found'} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description="Product details and variants"
        action={
          <Link to="/products">
            <Button variant="secondary">
              <ArrowLeft size={18} />
              Back to Products
            </Button>
          </Link>
        }
      />

      {error && <Alert message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-1">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">{product.name}</h3>
          <p className="mt-1 text-sm text-dashboard-text-sub">Article Number: {product.item_article || product.item_number || product.code}</p>
          <p className="mt-2 text-sm text-dashboard-text-sub">{product.description || 'No description'}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Category</dt>
              <dd className="font-medium text-dashboard-text-primary">{category?.name || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Brand</dt>
              <dd className="font-medium text-dashboard-text-primary">{brand?.name || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Created</dt>
              <dd className="font-medium text-dashboard-text-primary">{formatDate(product.created_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-dashboard-text-primary">Variants</h3>
            <Button onClick={() => { setEditingVariantId(null); reset(); setShowModal(true); }}>
              <Plus size={18} />
              Add Variant
            </Button>
          </div>

          <DataTable
            columns={[
              { key: 'size', header: 'Size' },
              { key: 'color', header: 'Colour' },
              { key: 'barcode', header: 'Barcode Number' },
              { key: 'stock', header: 'Stock' },
              { key: 'cost', header: 'Cost' },
              { key: 'price', header: 'Selling Price' },
              { key: 'actions', header: 'Actions', className: 'text-right' },
            ]}
            isEmpty={variants.length === 0}
            emptyMessage="No variants yet"
          >
            {variants.map((variant) => (
              <tr key={variant.id} className="hover:bg-dashboard-hover">
                <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">{variant.size}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{variant.color}</td>
                <td className="px-6 py-4 text-sm font-medium text-sky-300">{variant.barcode_number || '—'}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{variant.stock_quantity}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{variant.cost_price === null ? '-' : formatCurrency(variant.cost_price)}</td>
                <td className="px-6 py-4 text-sm text-dashboard-text-sub">{variant.selling_price === null ? '-' : formatCurrency(variant.selling_price)}</td>
                <td className="px-6 py-4 text-right text-sm">
                  <button type="button" onClick={() => handleEditVariant(variant)} className="mr-3 text-white/80 hover:text-white">
                    <Edit2 size={18} />
                  </button>
                  <button type="button" onClick={() => handleDeleteVariant(variant.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      </div>

      {showModal && (
        <Modal title={editingVariantId ? 'Edit Variant' : 'Add Variant'} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <Alert message={error} />}
            <div>
              <span className="mb-1 block text-sm font-medium text-dashboard-text-label">Barcode Number</span>
              <div className="rounded-lg border border-white/10 bg-white/[.04] px-3 py-2.5 text-sm text-dashboard-text-primary">
                {editingVariantId
                  ? variants.find((variant) => variant.id === editingVariantId)?.barcode_number || 'No barcode assigned'
                  : 'Generated automatically when the variant is created'}
              </div>
              <p className="mt-1 text-xs text-dashboard-text-sub">
                The barcode is permanent and remains unchanged when this variant is edited.
              </p>
            </div>
            <Input id="size" label="Size" error={errors.size?.message} {...register('size', { required: 'Size is required' })} />
            <Input id="color" label="Color" error={errors.color?.message} {...register('color', { required: 'Color is required' })} />
            <Input id="cost_price" label="Cost Price" type="number" step="0.01" error={errors.cost_price?.message} {...register('cost_price', { required: 'Required', valueAsNumber: true })} />
            <Input id="selling_price" label="Selling Price" type="number" step="0.01" error={errors.selling_price?.message} {...register('selling_price', { required: 'Required', valueAsNumber: true })} />
            <Input id="stock_quantity" label="Stock Quantity" type="number" error={errors.stock_quantity?.message} {...register('stock_quantity', { required: 'Required', valueAsNumber: true })} />
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Saving...' : editingVariantId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
