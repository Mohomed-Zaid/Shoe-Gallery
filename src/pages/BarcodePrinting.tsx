import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { BarcodeLabel } from '../components/barcode/BarcodeLabel';
import { Alert, Button, Input, LoadingSpinner, PageHeader } from '../components/ui';
import * as productService from '../services/productService';
import {
  getBarcodePrintDensity,
  printBarcodeLabels,
  validateBarcodeNumber,
} from '../services/barcodeLabelPrintService';
import { getStoreSettings } from '../services/settingsService';
import type { ProductVariant, StoreSettings } from '../types';

interface VariantWithProduct extends ProductVariant {
  product: {
    id: string;
    name: string;
    code: string;
    item_number?: string;
    item_article: string | null;
  } | null;
}

const DEFAULT_BARCODE_WIDTH = 1;
const DEFAULT_BARCODE_HEIGHT = 36;

function getPrintErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unable to open barcode print window.';
}

export function BarcodePrinting() {
  const [query, setQuery] = useState('');
  const [variants, setVariants] = useState<VariantWithProduct[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [copies, setCopies] = useState(1);
  const [printerSettings, setPrinterSettings] = useState<StoreSettings | null>(null);
  const [printerSettingsReady, setPrinterSettingsReady] = useState(false);
  const [printerSettingsError, setPrinterSettingsError] = useState<string | null>(null);
  const [validatedBarcode, setValidatedBarcode] = useState<string | null>(null);
  const [barcodeRenderError, setBarcodeRenderError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRequestId = useRef(0);

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

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [selectedVariantId, variants],
  );
  const selectedBarcode = selectedVariant?.barcode_number?.trim() ?? '';

  useEffect(() => {
    setValidatedBarcode(null);
    setBarcodeRenderError(null);
    if (!selectedBarcode) return;

    try {
      validateBarcodeNumber(selectedBarcode);
      setValidatedBarcode(selectedBarcode);
    } catch (barcodeError) {
      console.error('Barcode preview generation failed:', barcodeError);
      setBarcodeRenderError('Barcode could not be generated.');
    }
  }, [selectedBarcode]);

  const searchVariants = useCallback(async (searchQuery: string) => {
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      searchRequestId.current += 1;
      setVariants([]);
      setSelectedVariantId('');
      setLoading(false);
      return;
    }

    const requestId = ++searchRequestId.current;
    setLoading(true);
    setError(null);

    const { data, error: searchError } = await productService.searchVariants(normalizedQuery);
    if (requestId !== searchRequestId.current) return;

    if (searchError) {
      setError('Unable to load variants right now.');
      setVariants([]);
      setSelectedVariantId('');
    } else {
      const matches = ((data ?? []) as VariantWithProduct[]).map((variant) => ({
        ...variant,
        product: variant.product ?? null,
      }));
      setVariants(matches);
      setSelectedVariantId((currentId) => {
        if (matches.some((variant) => variant.id === currentId)) return currentId;
        return matches[0]?.id ?? '';
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      void searchVariants('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void searchVariants(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query, searchVariants]);

  const handlePrint = () => {
    if (!selectedVariant) {
      setError('Select a product variant first.');
      return;
    }
    if (!selectedBarcode) {
      setError('Barcode number is required.');
      return;
    }
    if (barcodeRenderError || validatedBarcode !== selectedBarcode) {
      setError('Barcode could not be generated.');
      return;
    }
    if (!printerSettingsReady) {
      setError(printerSettingsError ?? 'Barcode printer settings are still loading.');
      return;
    }
    if (isPrinting) return;

    setError(null);
    setIsPrinting(true);

    try {
      const printResult = printBarcodeLabels(selectedBarcode, {
        copies,
        articleNumber: selectedVariant.product?.item_article
          || selectedVariant.product?.item_number
          || selectedVariant.product?.code
          || undefined,
        colour: selectedVariant.color,
        size: selectedVariant.size,
        sellingPrice: selectedVariant.selling_price ?? undefined,
        costPrice: selectedVariant.cost_price ?? undefined,
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
        setIsPrinting(false);
      });
    } catch (printError) {
      console.error('Barcode label printing failed:', printError);
      setError(getPrintErrorMessage(printError));
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barcode Printing"
        description="Search for a product variant and print isolated 30mm × 20mm labels."
      />

      {printerSettingsError && <Alert message={printerSettingsError} />}
      {barcodeRenderError && <Alert message={barcodeRenderError} />}
      {error && <Alert message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-card space-y-4 p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                id="barcode-search"
                label="Search by product name or barcode"
                placeholder="Enter a product name or barcode"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="sm:self-end"
              onClick={() => {
                void searchVariants(query);
              }}
            >
              <Search size={18} />
              Search
            </Button>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : variants.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-dashboard-text-sub">
              {query.trim() ? 'No matching variants found.' : 'Search to select a product variant.'}
            </p>
          ) : (
            <div className="space-y-3" aria-label="Product variants">
              {variants.map((variant) => {
                const isSelected = selectedVariantId === variant.id;

                return (
                  <button
                    key={variant.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedVariantId(variant.id);
                      setError(null);
                    }}
                    className={[
                      'w-full rounded-2xl border p-4 text-left transition',
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500/10'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-dashboard-text-primary">
                          {variant.product?.name || 'Unnamed product'}
                        </p>
                        <p className="text-sm text-dashboard-text-sub">
                          {variant.size} / {variant.color}
                        </p>
                      </div>
                      <p className="text-right text-sm text-dashboard-text-sub">
                        Barcode: {variant.barcode_number || 'No barcode'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-dashboard-text-primary">Print Controls</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-dashboard-text-sub">
            <p className="font-semibold text-dashboard-text-primary">Selected variant</p>
            <p>{selectedVariant?.product?.name || 'No variant selected'}</p>
            <p>{selectedVariant ? [selectedVariant.size, selectedVariant.color].join(' / ') : '—'}</p>
            <p>Barcode: {selectedBarcode || '—'}</p>
          </div>

          <Input
            label="Copies"
            type="number"
            min={1}
            max={100}
            step={1}
            value={copies}
            onChange={(event) => {
              const nextCopies = Number.parseInt(event.target.value, 10);
              setCopies(Number.isFinite(nextCopies) ? Math.min(100, Math.max(1, nextCopies)) : 1);
            }}
          />

          <Button
            type="button"
            className="w-full"
            disabled={!printerSettingsReady || isPrinting}
            aria-busy={isPrinting}
            onClick={handlePrint}
          >
            <Printer size={18} />
            {isPrinting
              ? 'Printing…'
              : printerSettingsReady
                ? 'Print Barcode'
                : 'Loading Printer Settings…'}
          </Button>

          <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-dashboard-text-sub">
            Select 30mm × 20mm in the printer driver for correct label printing. Use 100% scale
            and 0/minimum margins.
          </p>
        </section>
      </div>

      <section className="glass-card p-6">
        <h2 className="text-lg font-semibold text-dashboard-text-primary">Preview</h2>
        <p className="mt-1 text-sm text-dashboard-text-sub">Label size: 30mm × 20mm</p>
        <p className="mt-1 text-xs text-dashboard-text-sub">The screen preview uses the base CODE128 proportions; saved printer calibration is applied only in the isolated print window.</p>
        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-dashboard-text-sub">
          Save as PDF is for basic visual testing only. A large PDF page can mean the PDF driver
          does not support 30mm × 20mm; it does not prove the physical label size is wrong.
        </p>
        <div className="mt-4 rounded-3xl border border-dashed border-white/15 bg-white p-6">
          {validatedBarcode === selectedBarcode && selectedBarcode && selectedVariant ? (
            <div className="barcode-label-preview">
              <BarcodeLabel
                barcodeNumber={selectedBarcode}
                articleNumber={selectedVariant.product?.item_article
                  || selectedVariant.product?.item_number
                  || selectedVariant.product?.code
                  || undefined}
                colour={selectedVariant.color}
                size={selectedVariant.size}
                sellingPrice={selectedVariant.selling_price}
                costPrice={selectedVariant.cost_price ?? undefined}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Select a variant with a barcode to preview its label.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
