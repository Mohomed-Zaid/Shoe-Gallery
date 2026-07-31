import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Search, Plus, Minus } from 'lucide-react';
import type { ProductVariant } from '../types';
import * as productService from '../services/productService';
import { Alert, Button, Input, LoadingSpinner, PageHeader } from '../components/ui';
import { BarcodeLabel } from '../components/barcode/BarcodeLabel';
import { formatCurrency } from '../utils/format';
import { buildPrintStyles } from '../utils/print';

interface VariantWithProduct extends ProductVariant {
  product: {
    id: string;
    name: string;
  } | null;
}

export function BarcodePrinting() {
  const [query, setQuery] = useState('');
  const [variants, setVariants] = useState<VariantWithProduct[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [selectedVariantId, variants],
  );

  const handleSearch = async () => {
    setError(null);
    setSearching(true);
    setLoading(true);

    const { data, error: searchError } = await productService.searchVariants(query);
    if (searchError) {
      setError('Unable to load variants right now.');
      setVariants([]);
      setSelectedVariantId('');
    } else {
      const mapped = ((data ?? []) as Array<VariantWithProduct>).map((item) => ({
        ...item,
        product: item.product ?? null,
      }));
      setVariants(mapped);
      if (mapped.length > 0) {
        setSelectedVariantId(mapped[0].id);
      } else {
        setSelectedVariantId('');
      }
    }

    setLoading(false);
    setSearching(false);
  };

  useEffect(() => {
    if (!query.trim()) {
      setVariants([]);
      setSelectedVariantId('');
      return;
    }
    const timeout = window.setTimeout(() => {
      void handleSearch();
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Barcode-${selectedVariant?.barcode_number ?? 'label'}`,
    pageStyle: buildPrintStyles(),
  });

  const printLabels = () => {
    if (!selectedVariant) {
      setError('Select a variant first.');
      return;
    }
    handlePrint();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barcode Printing"
        description="Search variants, generate labels, and print them in bulk"
      />

      {error && <Alert message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-card p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                id="barcode-search"
                label="Search by product name or barcode"
                placeholder="Try Nike, 100001, etc."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button onClick={() => { void handleSearch(); }} className="sm:self-end">
              <Search size={18} />
              Search
            </Button>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-3">
              {variants.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-dashboard-text-sub">
                  {searching ? 'Searching...' : 'No matching variants found.'}
                </p>
              ) : (
                variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selectedVariantId === variant.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-dashboard-text-primary">{variant.product?.name || 'Unnamed product'}</p>
                        <p className="text-sm text-dashboard-text-sub">{variant.size} / {variant.color}</p>
                      </div>
                      <div className="text-right text-sm text-dashboard-text-sub">
                        <p>Barcode: {variant.barcode_number || 'No barcode'}</p>
                        <p>Price: {formatCurrency(variant.selling_price)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="glass-card p-6 space-y-4">
          <h3 className="text-lg font-semibold text-dashboard-text-primary">Print Controls</h3>
          <div className="space-y-2">
            <label className="text-sm font-medium text-dashboard-text-label">Quantity</label>
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>
                <Minus size={16} />
              </Button>
              <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center font-semibold text-dashboard-text-primary">
                {quantity}
              </div>
              <Button type="button" variant="secondary" onClick={() => setQuantity((current) => current + 1)}>
                <Plus size={16} />
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-dashboard-text-sub">
            <p className="font-semibold text-dashboard-text-primary">Selected variant</p>
            <p>{selectedVariant?.product?.name || 'No variant selected'}</p>
            <p>{selectedVariant ? `${selectedVariant.size} / ${selectedVariant.color}` : '—'}</p>
            <p>Barcode: {selectedVariant?.barcode_number || '—'}</p>
            <p>Price: {selectedVariant ? formatCurrency(selectedVariant.selling_price) : '—'}</p>
          </div>

          <Button onClick={printLabels} className="w-full">
            <Printer size={18} />
            Print Label{quantity > 1 ? 's' : ''}
          </Button>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-dashboard-text-primary">Preview</h3>
        <div className="mt-4 rounded-3xl border border-dashed border-white/15 bg-white p-6">
          {selectedVariant ? (
            <div ref={printRef} className="barcode-label-print-area flex flex-wrap gap-[3mm] bg-white p-0">
              {Array.from({ length: quantity }).map((_, index) => (
                <div key={`${selectedVariant.id}-${index}`} className="barcode-label-print-item">
                  <BarcodeLabel
                    barcodeNumber={selectedVariant.barcode_number}
                    sellingPrice={selectedVariant.selling_price}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Select a variant to preview its label.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
