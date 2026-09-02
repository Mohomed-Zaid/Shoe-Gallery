import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Eye, Search, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Product, Category, Brand } from '../types';
import * as productService from '../services/productService';
import * as categoryService from '../services/categoryService';
import * as brandService from '../services/brandService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import { calculateCompanyCost } from '../utils/companyPricing';
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
  item_article: string;
  name: string;
  category_id: string;
  brand_id: string;
  description: string;
  selling_price?: number;
  company_percentage?: number;
}

type ProductFormMode = 'normal' | 'company';

export function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [formMode, setFormMode] = useState<ProductFormMode>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<ProductFormInputs>();
  const sellingPrice = Number(watch('selling_price'));
  const companyPercentage = Number(watch('company_percentage'));
  const calculatedCost = calculateCompanyCost(sellingPrice, companyPercentage);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return products;

    return products.filter((product) => {
      const category = categories.find((item) => item.id === product.category_id)?.name ?? '';
      const brand = brands.find((item) => item.id === product.brand_id)?.name ?? '';
      const productType = product.product_type === 'company' ? 'company' : 'normal';

      return [
        product.item_article,
        product.item_number,
        product.code,
        product.name,
        product.description,
        category,
        brand,
        productType,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [brands, categories, products, searchQuery]);

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

  const openCreateModal = (mode: ProductFormMode) => {
    setEditingId(null);
    setFormMode(mode);
    reset(mode === 'company' ? { company_percentage: 0 } : undefined);
    setShowModal(true);
  };

  const onSubmit = async (data: ProductFormInputs) => {
    setError(null);

    try {
      const payload = {
        is_active: true,
        name: data.name,
        code: data.item_article.trim(),
        item_number: data.item_article.trim(),
        item_article: data.item_article.trim(),
        category_id: data.category_id || null,
        brand_id: data.brand_id || null,
        description: data.description || null,
        image_url: null,
        ...(formMode === 'company' ? {
          product_type: 'company' as const,
          company_selling_price: Number(data.selling_price),
          company_percentage: Number(data.company_percentage),
        } : {}),
      };

      if (editingId) {
        const { error: updateError } = await productService.updateProduct(editingId, payload);
        if (updateError) throw updateError;
      } else {
        const { data: createdProduct, error: createError } = await productService.createProduct(payload);
        if (createError) {
          setError(getErrorMessage(createError, 'Unable to create product'));
          return;
        }
        if (formMode === 'company' && createdProduct) {
          closeModal();
          navigate(`/products/${createdProduct.id}`);
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
    const mode = product.product_type === 'company' ? 'company' : 'normal';
    setEditingId(product.id);
    setFormMode(mode);
    reset({
      item_article: product.item_article || product.item_number || product.code,
      name: product.name,
      category_id: product.category_id || '',
      brand_id: product.brand_id || '',
      description: product.description || '',
      selling_price: product.company_selling_price ?? undefined,
      company_percentage: product.company_percentage ?? undefined,
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
          <>
            <Button variant="outline" onClick={() => openCreateModal('company')}>
              <Plus size={20} />
              Company Product
            </Button>
            <Button onClick={() => openCreateModal('normal')}>
              <Plus size={20} />
              Add Product
            </Button>
          </>
        }
      />

      {error && <Alert message={error} />}

      <div className="relative max-w-xl">
        <label htmlFor="product-search" className="sr-only">Search products</label>
        <Search
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub"
        />
        <input
          id="product-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by article, name, category, or brand..."
          className="dashboard-input w-full pl-10 pr-10"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear product search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub transition-colors hover:text-dashboard-text-primary"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'article', header: 'Article Number' },
            { key: 'product', header: 'Product' },
            { key: 'category', header: 'Category' },
            { key: 'brand', header: 'Brand' },
            { key: 'created', header: 'Created At' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
          ]}
          isEmpty={filteredProducts.length === 0}
          emptyMessage={searchQuery.trim() ? 'No products match your search' : 'No products found'}
        >
          {filteredProducts.map((product) => (
            <tr key={product.id} className="hover:bg-dashboard-hover">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                {product.item_article || product.item_number || product.code}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-dashboard-text-primary">{product.name} <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-dashboard-text-sub">{product.product_type === 'company' ? 'Company' : 'Normal'}</span></div>
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
        <Modal title={editingId ? (formMode === 'company' ? 'Edit Company Product' : 'Edit Product') : (formMode === 'company' ? 'Add Company Product' : 'Add Product')} onClose={closeModal} size="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input id="name" label="Name" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Input
              id="item_article"
              label="Article Number"
              placeholder="e.g. SH-001"
              error={errors.item_article?.message}
              {...register('item_article', {
                required: 'Article number is required',
                pattern: { value: /^[A-Za-z0-9-]+$/, message: 'Use only letters, numbers, and hyphens' },
              })}
            />
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

            {formMode === 'company' && (
              <div className="grid gap-4 rounded-xl border border-dashboard-accent/25 bg-dashboard-accent/5 p-4 sm:grid-cols-2">
                <Input
                  id="selling_price"
                  label="Selling Price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  error={errors.selling_price?.message}
                  {...register('selling_price', {
                    required: 'Selling price is required',
                    valueAsNumber: true,
                    min: { value: 0.01, message: 'Selling price must be greater than zero' },
                  })}
                />
                <Input
                  id="company_percentage"
                  label="Company Percentage (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  error={errors.company_percentage?.message}
                  {...register('company_percentage', {
                    required: 'Company percentage is required',
                    valueAsNumber: true,
                    min: { value: 0, message: 'Percentage cannot be less than 0' },
                    max: { value: 100, message: 'Percentage cannot exceed 100' },
                  })}
                />
                <Input
                  id="calculated_cost_price"
                  label="Calculated Cost Price"
                  value={formatCurrency(calculatedCost)}
                  readOnly
                  className="cursor-not-allowed bg-white/[.03] font-semibold"
                />
                <p className="self-end pb-2 text-xs text-dashboard-text-sub">
                  Cost is calculated automatically from selling price minus the company percentage.
                </p>
              </div>
            )}

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
