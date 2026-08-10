import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Product, Category, Brand } from '../types';
import * as productService from '../services/productService';
import * as categoryService from '../services/categoryService';
import * as brandService from '../services/brandService';
import { getErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';
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

interface ProductFormInputs {
  name: string;
  category_id: string;
  brand_id: string;
  description: string;
}

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProductFormInputs>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [productsRes, categoriesRes, brandsRes] = await Promise.all([
      productService.getProducts(),
      categoryService.getCategories(),
      brandService.getBrands(),
    ]);

    if (productsRes.error || categoriesRes.error || brandsRes.error) {
      setError(getErrorMessage(productsRes.error ?? categoriesRes.error ?? brandsRes.error));
    } else {
      setProducts((productsRes.data as Product[]) ?? []);
      setCategories((categoriesRes.data as Category[]) ?? []);
      setBrands((brandsRes.data as Brand[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    reset();
  };

  const onSubmit = async (data: ProductFormInputs) => {
    setError(null);

    try {
      const payload = {
        is_active: true,
        name: data.name,
        category_id: data.category_id || null,
        brand_id: data.brand_id || null,
        description: data.description || null,
        image_url: null,
      };

      if (editingId) {
        const { error: updateError } = await productService.updateProduct(editingId, payload);
        if (updateError) throw updateError;
      } else {
        const { error: createError } = await productService.createProduct(payload);
        if (createError) {
          console.error('Automatic product code generation failed:', createError);
          setError('Unable to generate product code. Please try again.');
          return;
        }
      }

      closeModal();
      fetchData();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    reset({
      name: product.name,
      category_id: product.category_id || '',
      brand_id: product.brand_id || '',
      description: product.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const { error: deleteError } = await productService.deleteProduct(id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }
    fetchData();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your shoe inventory"
        action={
          <Button onClick={() => { setEditingId(null); reset(); setShowModal(true); }}>
            <Plus size={20} />
            Add Product
          </Button>
        }
      />

      {error && <Alert message={error} />}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'code', header: 'Code' },
            { key: 'product', header: 'Product' },
            { key: 'category', header: 'Category' },
            { key: 'brand', header: 'Brand' },
            { key: 'created', header: 'Created At' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={products.length === 0}
          emptyMessage="No products found"
        >
          {products.map((product) => (
            <tr key={product.id} className="hover:bg-dashboard-hover">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                {product.item_number || product.code}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-dashboard-text-primary">{product.name}</div>
                  <div className="text-sm text-dashboard-text-sub">{product.description || '-'}</div>
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">
                {categories.find((c) => c.id === product.category_id)?.name || '-'}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">
                {brands.find((b) => b.id === product.brand_id)?.name || '-'}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-dashboard-text-sub">{formatDate(product.created_at)}</td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                <Link to={`/products/${product.id}`} className="mr-3 inline-block text-dashboard-text-sub hover:text-dashboard-text-primary">
                  <Eye size={18} />
                </Link>
                <button type="button" onClick={() => handleEdit(product)} className="mr-3 text-white/80 hover:text-white">
                  <Edit2 size={18} />
                </button>
                <button type="button" onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {showModal && (
        <Modal title={editingId ? 'Edit Product' : 'Add Product'} onClose={closeModal} size="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <span className="mb-1 block text-sm font-medium text-dashboard-text-label">Product Code</span>
              <div className="rounded-lg border border-white/10 bg-white/[.04] px-3 py-2.5 text-sm text-dashboard-text-primary">
                {editingId
                  ? products.find((product) => product.id === editingId)?.item_number || products.find((product) => product.id === editingId)?.code
                  : 'Will be generated automatically'}
              </div>
              <p className="mt-1 text-xs text-dashboard-text-sub">
                {editingId ? 'Product codes cannot be changed.' : 'The next sequential code is assigned when you create the product.'}
              </p>
            </div>
            <Input id="name" label="Name" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Select id="category_id" label="Category" {...register('category_id')}>
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
            <Select id="brand_id" label="Brand" {...register('brand_id')}>
              <option value="">Select a brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </Select>
            <Textarea id="description" label="Description" rows={3} {...register('description')} />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
