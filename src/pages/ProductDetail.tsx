import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Barcode, Plus, Edit2, Printer, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { Product, ProductVariant, Category, Brand, StoreSettings } from '../types';
import * as productService from '../services/productService';
import * as categoryService from '../services/categoryService';
import * as brandService from '../services/brandService';
import { getStoreSettings } from '../services/settingsService';
import {
  getBarcodePrintDensity,
  printBarcodeLabelBatch,
  printBarcodeLabels,
} from '../services/barcodeLabelPrintService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate } from '../utils/format';
import { compareProductVariants } from '../utils/variantSorting';
import { calculateCompanyCost } from '../utils/companyPricing';
import {
  Alert,
  Button,
  DataTable,
  Input,
  LoadingSpinner,
  Modal,
  PageHeader,
} from '../components/ui';
import {
  BulkBarcodePrintModal,
  type BulkBarcodeSelection,
} from '../components/barcode/BulkBarcodePrintModal';

interface VariantFormInputs {
  size: string;
  color: string;
  cost_price: number;
  selling_price: number;
  company_percentage?: number;
  stock_quantity: number;
}

const DEFAULT_BARCODE_WIDTH = 1;
const DEFAULT_BARCODE_HEIGHT = 36;

function getPrintErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unable to open barcode print window.';
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
  const [printerSettings, setPrinterSettings] = useState<StoreSettings | null>(null);
  const [printerSettingsReady, setPrinterSettingsReady] = useState(false);
  const [printerSettingsError, setPrinterSettingsError] = useState<string | null>(null);
  const [printingVariantId, setPrintingVariantId] = useState<string | null>(null);
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [bulkPrintError, setBulkPrintError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<VariantFormInputs>();
  const sortedVariants = useMemo(() => [...variants].sort(compareProductVariants), [variants]);
  const isCompanyProduct = product?.product_type === 'company';
  const watchedSellingPrice = Number(watch('selling_price'));
  const watchedCompanyPercentage = Number(watch('company_percentage'));
  const calculatedCompanyCost = calculateCompanyCost(watchedSellingPrice, watchedCompanyPercentage);

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

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await getStoreSettings();
        if (!active) return;
        if (result.error) {
          setPrinterSettingsError('Unable to load barcode printer settings.');
          return;
        }

        setPrinterSettings(result.data as StoreSettings | null);
        setPrinterSettingsReady(true);
      } catch (settingsLoadError) {
        console.error('Barcode printer settings failed to load:', settingsLoadError);
        if (active) setPrinterSettingsError('Unable to load barcode printer settings.');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const closeModal = () => {
    setShowModal(false);
    setEditingVariantId(null);
    reset();
  };

  const openNewVariantModal = () => {
    setEditingVariantId(null);
    reset(isCompanyProduct ? {
      selling_price: product?.company_selling_price ?? undefined,
      company_percentage: product?.company_percentage ?? undefined,
      stock_quantity: 0,
    } : undefined);
    setShowModal(true);
  };

  const onSubmit = async (data: VariantFormInputs) => {
    if (!id) return;
    setError(null);

    const sellingPrice = Number(data.selling_price);
    const percentage = Number(data.company_percentage);
    const usesDefaultPercentage = isCompanyProduct
      && percentage === Number(product?.company_percentage);
    const variantValues = {
      size: data.size,
      color: data.color,
      cost_price: isCompanyProduct
        ? calculateCompanyCost(sellingPrice, percentage)
        : Number(data.cost_price),
      selling_price: sellingPrice,
      ...(isCompanyProduct ? {
        company_percentage: usesDefaultPercentage ? null : percentage,
      } : {}),
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
      company_percentage: variant.company_percentage ?? product?.company_percentage ?? undefined,
      stock_quantity: variant.stock_quantity,
    });
    setShowModal(true);
  };

  const handlePrintBarcode = (variant: ProductVariant) => {
    if (!product) return;
    const barcodeNumber = variant.barcode_number?.trim();
    if (!barcodeNumber) {
      setError('Barcode number is not available for this variant.');
      return;
    }
    if (!printerSettingsReady) {
      setError(printerSettingsError ?? 'Barcode printer settings are still loading.');
      return;
    }
    if (printingVariantId) return;

    setError(null);
    setPrintingVariantId(variant.id);

    try {
      const printResult = printBarcodeLabels(barcodeNumber, {
        copies: 1,
        articleNumber: product.item_article || product.item_number || product.code || undefined,
        colour: variant.color,
        size: variant.size,
        sellingPrice: variant.selling_price ?? undefined,
        costPrice: variant.cost_price ?? undefined,
        density: getBarcodePrintDensity(),
        barcodeWidth: Number(printerSettings?.barcode_width ?? DEFAULT_BARCODE_WIDTH),
        barcodeHeight: Number(printerSettings?.barcode_height ?? DEFAULT_BARCODE_HEIGHT),
        horizontalOffsetMm: Number(printerSettings?.barcode_horizontal_offset_mm ?? 0),
        verticalOffsetMm: Number(printerSettings?.barcode_vertical_offset_mm ?? 0),
      });

      void printResult.catch((printError: unknown) => {
        console.error('Barcode label printing failed:', printError);
        setError(getPrintErrorMessage(printError));
      }).finally(() => {
        setPrintingVariantId(null);
      });
    } catch (printError) {
      console.error('Barcode label printing failed:', printError);
      setError(getPrintErrorMessage(printError));
      setPrintingVariantId(null);
    }
  };

  const handleBulkPrint = (selections: BulkBarcodeSelection[]) => {
    if (!product || bulkPrinting) return;
    if (!printerSettingsReady) {
      setBulkPrintError(printerSettingsError ?? 'Barcode printer settings are still loading.');
      return;
    }

    setBulkPrintError(null);
    setBulkPrinting(true);
    const articleNumber = product.item_article || product.item_number || product.code || undefined;

    try {
      const printResult = printBarcodeLabelBatch(
        selections.map(({ variant, copies }) => ({
          barcodeNumber: variant.barcode_number?.trim() ?? '',
          articleNumber,
          colour: variant.color,
          size: variant.size,
          sellingPrice: variant.selling_price,
          costPrice: variant.cost_price,
          copies,
        })),
        {
          density: getBarcodePrintDensity(),
          barcodeWidth: Number(printerSettings?.barcode_width ?? DEFAULT_BARCODE_WIDTH),
          barcodeHeight: Number(printerSettings?.barcode_height ?? DEFAULT_BARCODE_HEIGHT),
          horizontalOffsetMm: Number(printerSettings?.barcode_horizontal_offset_mm ?? 0),
          verticalOffsetMm: Number(printerSettings?.barcode_vertical_offset_mm ?? 0),
        },
      );

      void printResult.then(() => {
        setShowBulkPrintModal(false);
      }).catch((printError: unknown) => {
        console.error('Bulk barcode label printing failed:', printError);
        setBulkPrintError(getPrintErrorMessage(printError));
      }).finally(() => {
        setBulkPrinting(false);
      });
    } catch (printError) {
      console.error('Bulk barcode label printing failed:', printError);
      setBulkPrintError(getPrintErrorMessage(printError));
      setBulkPrinting(false);
    }
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

      <div className="grid min-w-0 max-w-full gap-6 lg:grid-cols-3">
        <div className="glass-card min-w-0 max-w-full p-6 lg:col-span-1">
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
              <dt className="text-dashboard-text-label">Product Type</dt>
              <dd className="font-medium text-dashboard-text-primary">{isCompanyProduct ? 'Company Product' : 'Normal Product'}</dd>
            </div>
            {isCompanyProduct && (
              <div className="flex justify-between">
                <dt className="text-dashboard-text-label">Company Percentage</dt>
                <dd className="font-medium text-dashboard-text-primary">{product.company_percentage}%</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-dashboard-text-label">Created</dt>
              <dd className="font-medium text-dashboard-text-primary">{formatDate(product.created_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="min-w-0 max-w-full space-y-4 lg:col-span-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-dashboard-text-primary">Variants</h3>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                disabled={variants.length === 0 || printingVariantId !== null}
                onClick={() => { setBulkPrintError(null); setShowBulkPrintModal(true); }}
              >
                <Printer size={18} />
                Print All Barcodes
              </Button>
              <Button onClick={openNewVariantModal}>
                <Plus size={18} />
                Add Variant
              </Button>
            </div>
          </div>

          <DataTable
            columns={[
              { key: 'size', header: 'Size', className: 'w-[10%]' },
              { key: 'color', header: 'Colour', className: 'w-[12%]' },
              { key: 'barcode', header: 'Barcode Number', className: 'w-[18%]' },
              { key: 'stock', header: 'Stock', className: 'w-[9%]' },
              { key: 'cost', header: 'Cost', className: 'w-[15%]' },
              { key: 'price', header: 'Selling Price', className: 'w-[19%]' },
              { key: 'actions', header: 'Actions', className: 'w-[17%] text-right' },
            ]}
            className="product-variants-table"
            isEmpty={variants.length === 0}
            emptyMessage="No variants yet"
          >
            {sortedVariants.map((variant) => (
              <tr key={variant.id} className="hover:bg-dashboard-hover">
                <td title={variant.size} className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2.5 text-[13px] font-medium text-dashboard-text-primary 2xl:px-4 2xl:py-4 2xl:text-sm">{variant.size}</td>
                <td title={variant.color} className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2.5 text-[13px] text-dashboard-text-sub 2xl:px-4 2xl:py-4 2xl:text-sm">{variant.color}</td>
                <td title={variant.barcode_number || 'No barcode'} className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2.5 text-[13px] font-medium text-sky-300 2xl:px-4 2xl:py-4 2xl:text-sm">{variant.barcode_number || '—'}</td>
                <td title={String(variant.stock_quantity)} className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2.5 text-[13px] text-dashboard-text-sub 2xl:px-4 2xl:py-4 2xl:text-sm">{variant.stock_quantity}</td>
                <td title={variant.cost_price === null ? 'No cost price' : formatCurrency(variant.cost_price)} className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2.5 text-[13px] text-dashboard-text-sub 2xl:px-4 2xl:py-4 2xl:text-sm">{variant.cost_price === null ? '-' : formatCurrency(variant.cost_price)}</td>
                <td title={variant.selling_price === null ? 'No selling price' : formatCurrency(variant.selling_price)} className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2.5 text-[13px] text-dashboard-text-sub 2xl:px-4 2xl:py-4 2xl:text-sm">{variant.selling_price === null ? '-' : formatCurrency(variant.selling_price)}</td>
                <td className="overflow-hidden whitespace-nowrap px-1 py-2.5 text-right text-[13px] 2xl:px-4 2xl:py-4 2xl:text-sm">
                  <div className="inline-flex max-w-full items-center gap-1 whitespace-nowrap 2xl:gap-2">
                    <button
                      type="button"
                      title="Print Barcode"
                      aria-label="Print Barcode"
                      aria-busy={printingVariantId === variant.id}
                      onClick={() => handlePrintBarcode(variant)}
                      className="rounded p-1 text-sky-300 transition hover:bg-white/[0.06] hover:text-sky-200 disabled:opacity-50"
                      disabled={printingVariantId !== null}
                    >
                      <Barcode size={18} />
                    </button>
                    <button type="button" title="Edit Variant" aria-label="Edit Variant" onClick={() => handleEditVariant(variant)} className="rounded p-1 text-white/80 transition hover:bg-white/[0.06] hover:text-white">
                      <Edit2 size={18} />
                    </button>
                    <button type="button" title="Delete Variant" aria-label="Delete Variant" onClick={() => handleDeleteVariant(variant.id)} className="rounded p-1 text-red-400 transition hover:bg-white/[0.06] hover:text-red-300">
                      <Trash2 size={18} />
                    </button>
                  </div>
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
            {isCompanyProduct ? (
              <>
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
                  value={formatCurrency(calculatedCompanyCost)}
                  readOnly
                  className="cursor-not-allowed bg-white/[.03] font-semibold"
                />
              </>
            ) : (
              <>
                <Input id="cost_price" label="Cost Price" type="number" step="0.01" error={errors.cost_price?.message} {...register('cost_price', { required: 'Required', valueAsNumber: true })} />
                <Input id="selling_price" label="Selling Price" type="number" step="0.01" error={errors.selling_price?.message} {...register('selling_price', { required: 'Required', valueAsNumber: true })} />
              </>
            )}
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

      {showBulkPrintModal && (
        <BulkBarcodePrintModal
          product={product}
          variants={variants}
          isPrinting={bulkPrinting}
          error={bulkPrintError}
          onClose={() => {
            if (bulkPrinting) return;
            setShowBulkPrintModal(false);
            setBulkPrintError(null);
          }}
          onPrint={handleBulkPrint}
        />
      )}
    </div>
  );
}
