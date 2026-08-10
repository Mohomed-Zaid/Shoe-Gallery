import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { ProductVariant } from '../types';
import type { InventoryMatrixProduct } from '../services/inventoryService';
import * as inventoryService from '../services/inventoryService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { Alert, Button, LoadingSpinner, PageHeader } from '../components/ui';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function cellKey(size: string, colour: string) {
  return `${normalize(colour)}\u0000${normalize(size)}`;
}

function stockTone(quantity: number) {
  if (quantity <= 0) return 'inventory-matrix-stock-out';
  if (quantity < 10) return 'inventory-matrix-stock-low';
  return 'inventory-matrix-stock-in';
}

function stockLabel(quantity: number) {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity < 10) return 'Low Stock';
  return 'In Stock';
}

export function InventorySheetPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<InventoryMatrixProduct | null>(null);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [baseCostPrice, setBaseCostPrice] = useState(0);
  const [baseSellingPrice, setBaseSellingPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [changingDimension, setChangingDimension] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const pendingSaves = useRef(0);

  const loadMatrix = useCallback(async (showLoader = true) => {
    if (!productId) return;
    if (showLoader) setLoading(true);
    setError(null);
    const result = await inventoryService.getProductInventoryMatrix(productId);
    if (result.error || !result.data) {
      setError(getErrorMessage(result.error, 'Unable to load this inventory matrix'));
    } else {
      const nextQuantities: Record<string, string> = {};
      for (const variant of result.data.variants) {
        const key = cellKey(variant.size, variant.color);
        nextQuantities[key] = String(Number(nextQuantities[key] ?? 0) + Number(variant.stock_quantity));
      }
      for (const colour of result.data.colours) {
        for (const size of result.data.sizes) {
          const key = cellKey(size, colour);
          if (nextQuantities[key] === undefined) nextQuantities[key] = '0';
        }
      }

      setProduct(result.data.product);
      setSizes(result.data.sizes);
      setColours(result.data.colours);
      setVariants(result.data.variants);
      setQuantities(nextQuantities);
      setBaseCostPrice(result.data.baseCostPrice);
      setBaseSellingPrice(result.data.baseSellingPrice);
      setSaveState('idle');
    }
    if (showLoader) setLoading(false);
  }, [productId]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const variantsByCell = useMemo(() => {
    const grouped = new Map<string, ProductVariant[]>();
    for (const variant of variants) {
      const key = cellKey(variant.size, variant.color);
      grouped.set(key, [...(grouped.get(key) ?? []), variant]);
    }
    return grouped;
  }, [variants]);

  const quantityAt = (size: string, colour: string) => {
    const parsed = Number(quantities[cellKey(size, colour)] ?? 0);
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
  };

  const rowTotal = (colour: string) => sizes.reduce((sum, size) => sum + quantityAt(size, colour), 0);
  const columnTotal = (size: string) => colours.reduce((sum, colour) => sum + quantityAt(size, colour), 0);
  const grandTotal = colours.reduce((sum, colour) => sum + rowTotal(colour), 0);

  const saveCell = async (size: string, colour: string) => {
    if (!productId) return;
    const key = cellKey(size, colour);
    const quantity = quantityAt(size, colour);
    setQuantities((current) => ({ ...current, [key]: String(quantity) }));
    pendingSaves.current += 1;
    setSaveState('saving');
    setError(null);

    const result = await inventoryService.setInventoryMatrixStock(productId, size, colour, quantity);
    pendingSaves.current -= 1;
    if (result.error) {
      const message = getErrorMessage(result.error, `Could not save ${colour} / ${size}`);
      setSaveState('error');
      await loadMatrix(false);
      setSaveState('error');
      setError(message);
      return;
    }
    if (pendingSaves.current === 0) setSaveState('saved');
  };

  const addDimension = async (type: 'size' | 'colour') => {
    if (!productId) return;
    const label = type === 'size' ? 'Size' : 'Colour Name';
    const value = prompt(`Enter ${label}`)?.trim();
    if (!value) return;
    const existing = type === 'size' ? sizes : colours;
    if (existing.some((item) => normalize(item) === normalize(value))) {
      setError(`${type === 'size' ? 'Size' : 'Colour'} “${value}” already exists.`);
      return;
    }

    setChangingDimension(true);
    setError(null);
    const result = await inventoryService.addInventoryMatrixDimension(productId, type, value);
    if (result.error) setError(getErrorMessage(result.error));
    else await loadMatrix(false);
    setChangingDimension(false);
  };

  const removeDimension = async (type: 'size' | 'colour', value: string) => {
    if (!productId) return;
    const stock = type === 'size' ? columnTotal(value) : rowTotal(value);
    const itemLabel = type === 'size' ? 'size' : 'colour';
    const warning = stock > 0
      ? `This ${itemLabel} contains ${stock} item(s) in stock. Are you sure you want to remove it?`
      : `Remove ${itemLabel} “${value}”?`;
    if (!confirm(warning)) return;

    setChangingDimension(true);
    setError(null);
    const result = await inventoryService.removeInventoryMatrixDimension(productId, type, value);
    if (result.error) setError(getErrorMessage(result.error));
    else await loadMatrix(false);
    setChangingDimension(false);
  };

  if (loading) return <LoadingSpinner />;
  if (!product) return <Alert message={error ?? 'Product not found'} />;

  return (
    <div className="inventory-matrix-page flex min-h-0 flex-col gap-5">
      <PageHeader
        title={`${product.name} Inventory Matrix`}
        description="Sizes are columns, colours are rows, and every cell is actual variant stock."
        action={
          <>
            <Link to="/inventory"><Button variant="secondary"><ArrowLeft size={18} />Inventory</Button></Link>
            <Button variant="secondary" disabled={changingDimension} onClick={() => void addDimension('size')}><Plus size={18} />Add Size</Button>
            <Button variant="secondary" disabled={changingDimension} onClick={() => void addDimension('colour')}><Plus size={18} />Add Colour</Button>
          </>
        }
      />

      {error && <Alert message={error} />}

      <section className="glass-card p-4 sm:p-5">
        <div className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Product</p><p className="mt-1 font-semibold text-dashboard-text-primary">{product.name}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Code</p><p className="mt-1 font-semibold text-dashboard-text-primary">{product.item_number || product.code}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Article</p><p className="mt-1 font-semibold text-dashboard-text-primary">{product.item_article || '-'}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Category</p><p className="mt-1 font-semibold text-dashboard-text-primary">{product.category?.name || '—'}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Brand</p><p className="mt-1 font-semibold text-dashboard-text-primary">{product.brand?.name || '—'}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Base Cost</p><p className="mt-1 font-semibold text-dashboard-text-primary">{formatCurrency(baseCostPrice)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Base Selling</p><p className="mt-1 font-semibold text-dashboard-text-primary">{formatCurrency(baseSellingPrice)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Total Stock</p><p className="mt-1 text-lg font-bold text-dashboard-accent">{grandTotal}</p></div>
        </div>
      </section>

      <div className="flex min-h-6 items-center justify-end text-xs" aria-live="polite">
        {saveState === 'saving' && <span className="text-amber-300">Saving…</span>}
        {saveState === 'saved' && <span className="text-emerald-300">Saved</span>}
        {saveState === 'error' && <span className="text-red-300">Save failed</span>}
      </div>

      <section className="inventory-matrix-shell glass-card min-h-0 flex-1">
        <div className="inventory-matrix-scroll relative z-10 max-h-[calc(100dvh-20rem)] min-h-72 overflow-auto">
          <table className="inventory-matrix-grid min-w-max border-separate border-spacing-0">
            <thead className="sticky top-0 z-30">
              <tr>
                <th className="inventory-matrix-code sticky left-0 z-40 min-w-36">
                  <span className="block text-[10px] uppercase tracking-widest text-white/55">Code No</span>
                  <span className="mt-1 block text-sm">{product.item_number || product.code}</span>
                </th>
                {sizes.map((size) => (
                  <th key={normalize(size)} className="inventory-matrix-size min-w-24">
                    <div className="flex items-center justify-center gap-2 px-2 py-3">
                      <span>{size}</span>
                      <button type="button" title={`Remove size ${size}`} onClick={() => void removeDimension('size', size)} className="rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colours.map((colour) => (
                <tr key={normalize(colour)}>
                  <th className="inventory-matrix-colour sticky left-0 z-20 min-w-36">
                    <div className="flex items-center justify-between gap-2 px-3 py-3">
                      <span className="truncate">{colour}</span>
                      <button type="button" title={`Remove colour ${colour}`} onClick={() => void removeDimension('colour', colour)} className="shrink-0 rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                  {sizes.map((size) => {
                    const key = cellKey(size, colour);
                    const quantity = quantityAt(size, colour);
                    const cellVariants = variantsByCell.get(key) ?? [];
                    const details = cellVariants[0];
                    const title = [
                      `${colour} / Size ${size}`,
                      `Stock: ${quantity} (${stockLabel(quantity)})`,
                      details?.barcode_number ? `Barcode: ${details.barcode_number}` : null,
                      details ? `Cost: ${formatCurrency(details.cost_price)}` : null,
                      details ? `Selling: ${formatCurrency(details.selling_price)}` : null,
                    ].filter(Boolean).join('\n');
                    return (
                      <td key={normalize(size)} className={`inventory-matrix-cell ${stockTone(quantity)}`} title={title}>
                        <input
                          aria-label={`${colour}, size ${size}, stock quantity`}
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={quantities[key] ?? '0'}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (next === '' || /^\d+$/.test(next)) {
                              setQuantities((current) => ({ ...current, [key]: next }));
                              setSaveState('idle');
                            }
                          }}
                          onBlur={() => void saveCell(size, colour)}
                          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          className="h-12 w-24 bg-transparent px-2 text-center text-base font-semibold text-slate-900 outline-none"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {(!sizes.length || !colours.length) && (
            <div className="bg-white p-10 text-center text-sm text-slate-600">
              {!sizes.length && !colours.length
                ? 'Add at least one size and one colour to create the first stock cell.'
                : !sizes.length ? 'Add a size to create stock cells.' : 'Add a colour to create stock cells.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
