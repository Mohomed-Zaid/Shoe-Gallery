import { useMemo, useState } from 'react';
import { AlertTriangle, Barcode, Printer } from 'lucide-react';
import type { Product, ProductVariant } from '../../types';
import { Button, Modal } from '../ui';

export interface BulkBarcodeSelection {
  variant: ProductVariant;
  copies: number;
}

interface BulkBarcodePrintModalProps {
  product: Product;
  variants: ProductVariant[];
  isPrinting: boolean;
  error?: string | null;
  onClose: () => void;
  onPrint: (selections: BulkBarcodeSelection[]) => void;
}

type PrintMode = 'one-per-variant' | 'custom';

const variantCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortVariants(left: ProductVariant, right: ProductVariant) {
  return variantCollator.compare(left.size, right.size)
    || variantCollator.compare(left.color, right.color)
    || variantCollator.compare(left.barcode_number ?? '', right.barcode_number ?? '');
}

function hasBarcode(variant: ProductVariant) {
  return Boolean(variant.barcode_number?.trim());
}

export function BulkBarcodePrintModal({
  product,
  variants,
  isPrinting,
  error,
  onClose,
  onPrint,
}: BulkBarcodePrintModalProps) {
  const sortedVariants = useMemo(() => [...variants].sort(sortVariants), [variants]);
  const printableVariants = useMemo(() => sortedVariants.filter(hasBarcode), [sortedVariants]);
  const missingBarcodeVariants = useMemo(() => sortedVariants.filter((variant) => !hasBarcode(variant)), [sortedVariants]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(printableVariants.map((variant) => variant.id)),
  );
  const [printMode, setPrintMode] = useState<PrintMode>('one-per-variant');
  const [copiesById, setCopiesById] = useState<Record<string, number>>({});

  const selectedVariants = printableVariants.filter((variant) => selectedIds.has(variant.id));
  const labelsToPrint = selectedVariants.reduce(
    (total, variant) => total + (printMode === 'custom' ? (copiesById[variant.id] ?? 1) : 1),
    0,
  );

  const toggleVariant = (variantId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const setCopies = (variantId: string, value: number) => {
    const copies = Math.min(100, Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)));
    setCopiesById((current) => ({ ...current, [variantId]: copies }));
  };

  const handlePrint = () => {
    onPrint(selectedVariants.map((variant) => ({
      variant,
      copies: printMode === 'custom' ? (copiesById[variant.id] ?? 1) : 1,
    })));
  };

  return (
    <Modal title="Bulk Barcode Print" onClose={onClose} size="lg">
      <div className="flex h-[min(72dvh,620px)] min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b border-white/10 pb-3">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-sm sm:grid-cols-4">
            <div><dt className="text-dashboard-text-label">Product</dt><dd className="truncate font-semibold text-dashboard-text-primary">{product.name}</dd></div>
            <div><dt className="text-dashboard-text-label">Article</dt><dd className="truncate font-semibold text-dashboard-text-primary">{product.item_article || product.item_number || product.code || '-'}</dd></div>
            <div><dt className="text-dashboard-text-label">Selected Variants</dt><dd className="font-semibold text-dashboard-text-primary">{selectedVariants.length}</dd></div>
            <div><dt className="text-dashboard-text-label">Labels to Print</dt><dd className="font-semibold text-dashboard-text-primary">{labelsToPrint}</dd></div>
          </dl>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-dashboard-text-label">Print mode</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-dashboard-text-primary">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="bulk-print-mode" checked={printMode === 'one-per-variant'} onChange={() => setPrintMode('one-per-variant')} className="accent-emerald-500" />
                One label per variant
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="bulk-print-mode" checked={printMode === 'custom'} onChange={() => setPrintMode('custom')} className="accent-emerald-500" />
                Custom copies per variant
              </label>
            </div>
          </fieldset>

          {missingBarcodeVariants.length > 0 && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={15} />
                {missingBarcodeVariants.length} {missingBarcodeVariants.length === 1 ? 'variant does' : 'variants do'} not have barcode numbers and will be skipped.
              </div>
              <p className="mt-1 pl-[23px] text-amber-100/80">
                {missingBarcodeVariants.map((variant) => `${variant.size} / ${variant.color}`).join(', ')}
              </p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-medium text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-dashboard-text-sub">Variants: {variants.length}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set(printableVariants.map((variant) => variant.id)))}>Select All</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear All</Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2 pr-1" aria-label="Variant barcode selection">
          <div className="space-y-1.5">
            {sortedVariants.map((variant) => {
              const printable = hasBarcode(variant);
              const selected = printable && selectedIds.has(variant.id);
              return (
                <div
                  key={variant.id}
                  className={`flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-sm ${printable ? 'cursor-pointer border-white/10 bg-white/[0.04] hover:bg-white/[0.07]' : 'cursor-not-allowed border-amber-400/15 bg-amber-400/[0.04] opacity-65'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!printable || isPrinting}
                    onChange={() => toggleVariant(variant.id)}
                    className="h-4 w-4 shrink-0 accent-emerald-500"
                  />
                  <Barcode size={16} className="shrink-0 text-sky-300" />
                  <span className="min-w-0 flex-1 truncate text-dashboard-text-primary">
                    Size {variant.size} <span className="text-dashboard-text-sub">|</span> {variant.color} <span className="text-dashboard-text-sub">|</span> {variant.barcode_number || 'Missing barcode'}
                  </span>
                  {printMode === 'custom' && printable && (
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-dashboard-text-sub">
                      Copies
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={copiesById[variant.id] ?? 1}
                        disabled={!selected || isPrinting}
                        onChange={(event) => setCopies(variant.id, event.currentTarget.valueAsNumber)}
                        className="w-16 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-center text-dashboard-text-primary outline-none focus:border-dashboard-accent"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 pt-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPrinting}>Cancel</Button>
          <Button type="button" onClick={handlePrint} disabled={labelsToPrint === 0 || isPrinting}>
            <Printer size={17} />
            {isPrinting ? 'Opening Print Job...' : `Print Selected Barcodes (${labelsToPrint})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
