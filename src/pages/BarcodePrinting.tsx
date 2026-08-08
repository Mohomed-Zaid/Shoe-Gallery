import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import type { ProductVariant, StoreSettings } from '../types';
import * as productService from '../services/productService';
import { Alert, Button, Input, LoadingSpinner, PageHeader } from '../components/ui';
import { BarcodeLabel } from '../components/barcode/BarcodeLabel';
import { getStoreSettings } from '../services/settingsService';
import { printBarcodeLabels } from '../services/barcodePrintService';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [copies,setCopies]=useState(1);
  const printRef = useRef<HTMLDivElement>(null);
  const [printerSettings,setPrinterSettings]=useState<StoreSettings|null>(null);

  useEffect(()=>{void getStoreSettings().then(result=>{if(!result.error)setPrinterSettings(result.data as StoreSettings|null)})},[]);

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

  const printLabels = async () => {
    if (!selectedVariant) {
      setError('Select a variant first.');
      return;
    }
    if(!selectedVariant.barcode_number?.trim()){
      setError('Barcode could not be generated.');
      return;
    }
    setError(null);
    try{
      await printBarcodeLabels(printRef.current,{forceCustomPageSize:printerSettings?.barcode_force_custom_page_size??false,horizontalOffsetMm:Number(printerSettings?.barcode_horizontal_offset_mm??0),verticalOffsetMm:Number(printerSettings?.barcode_vertical_offset_mm??0)});
    }catch(printError){
      console.error('Barcode printing failed:',printError);
      setError(printError instanceof Error?printError.message:'Barcode printing failed. Please check the printer connection and 30mm × 20mm driver paper size.');
    }
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
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-dashboard-text-sub">
            <p className="font-semibold text-dashboard-text-primary">Selected variant</p>
            <p>{selectedVariant?.product?.name || 'No variant selected'}</p>
            <p>{selectedVariant ? `${selectedVariant.size} / ${selectedVariant.color}` : '—'}</p>
            <p>Barcode: {selectedVariant?.barcode_number || '—'}</p>
          </div>

          <Input label="Copies" type="number" min={1} max={100} step={1} value={copies} onChange={event=>setCopies(Math.min(100,Math.max(1,Number(event.target.value)||1)))}/>

          <Button onClick={()=>void printLabels()} className="w-full">
            <Printer size={18} />
            Print Label
          </Button>
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-dashboard-text-sub">For correct printing, select the label printer and use:<br/>Paper Size: 30mm × 20mm<br/>Scale: 100%<br/>Margins: None<br/>Headers and Footers: Off</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-dashboard-text-primary">Preview</h3>
        <p className="mt-1 text-sm text-dashboard-text-sub">Actual label size: 30mm × 20mm</p>
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-dashboard-text-sub"><strong className="text-dashboard-text-primary">Printer settings:</strong> Windows Settings → Printers &amp; Scanners → select the barcode printer → Printer Preferences → create/select 30mm × 20mm, Portrait, margins 0/minimum, scaling 100%. Select that printer in the browser dialog. Save as PDF tests layout only and does not confirm physical-printer compatibility.</div>
        <div className="mt-4 rounded-3xl border border-dashed border-white/15 bg-white p-6">
          {selectedVariant ? (
            <div ref={printRef} className="barcode-print-root barcode-preview-shell bg-white p-0">
              {Array.from({length:copies},(_,index)=><div className="barcode-label-print-item" key={index}>
                  <BarcodeLabel
                    barcodeNumber={selectedVariant.barcode_number}
                    barcodeWidth={Number(printerSettings?.barcode_width??1)}
                    barcodeHeight={Number(printerSettings?.barcode_height??30)}
                    className="barcode-preview-label"
                  />
              </div>)}
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
