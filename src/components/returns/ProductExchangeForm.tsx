import { useMemo, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import type { Product, ProductVariant } from '../../types';
import type { ReturnableSale } from '../../types/salesReturn';
import { completeProductExchange } from '../../services/salesReturnService';
import { searchVariants } from '../../services/productService';
import { calculateItemDiscount, getDiscountPriceError } from '../../utils/itemDiscount';
import { calculateExchangeDifference, calculateHistoricalPaidUnitValue } from '../../utils/exchangeCalculation';
import { getErrorMessage } from '../../utils/errors';
import { formatCurrency } from '../../utils/format';
import { Alert, Button, Input, Select, Textarea } from '../ui';

interface ReplacementVariant extends ProductVariant {
  product: Product | null;
}

interface ProductExchangeFormProps {
  sale: ReturnableSale;
  onCompleted: (returnId: string) => void;
}

export function ProductExchangeForm({ sale, onCompleted }: ProductExchangeFormProps) {
  const returnableItems = sale.sale_items.filter((item) => item.remaining_quantity > 0 && item.variant_id);
  const [saleItemId, setSaleItemId] = useState(returnableItems[0]?.id ?? '');
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [condition, setCondition] = useState('resellable');
  const [restock, setRestock] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReplacementVariant[]>([]);
  const [replacement, setReplacement] = useState<ReplacementVariant | null>(null);
  const [replacementQuantity, setReplacementQuantity] = useState(1);
  const [discountPrice, setDiscountPrice] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [settlementMethod, setSettlementMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState(0);
  const [reference, setReference] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const originalItem = sale.sale_items.find((item) => item.id === saleItemId);
  const paidUnitValue = originalItem ? calculateHistoricalPaidUnitValue(sale, originalItem) : 0;
  const exchangeCredit = paidUnitValue * returnQuantity;
  const replacementPricing = replacement
    ? calculateItemDiscount(Number(replacement.selling_price), discountPrice, replacementQuantity)
    : { unitDiscount: 0, lineDiscount: 0, lineTotal: 0 };
  const exchangeResult = calculateExchangeDifference(exchangeCredit, replacementPricing.lineTotal);
  const changeDue = exchangeResult.differenceType === 'customer_pays' && settlementMethod === 'cash'
    ? Math.max(amountReceived - exchangeResult.differenceAmount, 0)
    : 0;
  const discountError = replacement
    ? getDiscountPriceError(Number(replacement.selling_price), discountPrice)
    : null;

  const originalLabel = useMemo(() => returnableItems.map((item) => ({
    id: item.id,
    label: `${item.variant?.product?.name || item.product_name_snapshot || 'Product'} · ${item.variant?.size || item.size_snapshot || '-'} / ${item.variant?.color || item.color_snapshot || '-'} · ${item.remaining_quantity} available`,
  })), [returnableItems]);

  const findReplacement = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(undefined);
    try {
      const response = await searchVariants(query);
      if (response.error) throw response.error;
      setResults(((response.data ?? []) as unknown as ReplacementVariant[])
        .filter((variant) => variant.is_active !== false && variant.stock_quantity > 0));
    } catch (searchError) {
      setError(getErrorMessage(searchError, 'Unable to search replacement products.'));
    } finally {
      setSearching(false);
    }
  };

  const selectReplacement = (variant: ReplacementVariant) => {
    setReplacement(variant);
    setDiscountPrice(Number(variant.selling_price));
    setReplacementQuantity(Math.min(returnQuantity, variant.stock_quantity));
    setResults([]);
    setQuery(variant.barcode_number || variant.product?.item_article || variant.product?.name || '');
  };

  const submit = async () => {
    if (!originalItem || !replacement || !reason.trim()) {
      setError('Select the original item and replacement, then enter a reason.');
      return;
    }
    if (returnQuantity < 1 || returnQuantity > originalItem.remaining_quantity) {
      setError('Exchange quantity exceeds the available quantity.');
      return;
    }
    if (replacementQuantity < 1 || replacementQuantity > replacement.stock_quantity) {
      setError('Replacement quantity exceeds available stock.');
      return;
    }
    if (discountError) {
      setError(discountError);
      return;
    }
    if (exchangeResult.differenceType === 'customer_pays' && settlementMethod === 'cash' && amountReceived < exchangeResult.differenceAmount) {
      setError('Amount received must cover the customer payment due.');
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const returnId = await completeProductExchange({
        sale_id: sale.id,
        sale_item_id: originalItem.id,
        return_quantity: returnQuantity,
        condition,
        restock,
        replacement_variant_id: replacement.id,
        replacement_quantity: replacementQuantity,
        discount_price: discountPrice,
        reason,
        notes,
        settlement_method: exchangeResult.differenceType === 'even' ? undefined : settlementMethod,
        amount_received: settlementMethod === 'cash' ? amountReceived : exchangeResult.differenceAmount,
        reference,
      });
      onCompleted(returnId);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  if (!returnableItems.length) return <Alert message="This invoice has no exchangeable inventory items." />;

  return (
    <div className="space-y-5">
      {error && <Alert message={error} />}
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <section className="glass-card min-w-0 p-5">
          <div className="relative z-10 space-y-4">
            <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Original item</p><h2 className="mt-1 text-lg font-semibold">Exchange credit</h2></div>
            <Select label="Purchased item" value={saleItemId} onChange={(event) => { setSaleItemId(event.target.value); setReturnQuantity(1); }}>
              {originalLabel.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
            {originalItem && <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4 sm:grid-cols-2">
              <Info label="Product" value={originalItem.variant?.product?.name || originalItem.product_name_snapshot || 'Product'} />
              <Info label="Article" value={originalItem.variant?.product?.item_article || '-'} />
              <Info label="Variant" value={`${originalItem.variant?.size || originalItem.size_snapshot || '-'} / ${originalItem.variant?.color || originalItem.color_snapshot || '-'}`} />
              <Info label="Barcode" value={originalItem.variant?.barcode_number || '-'} />
              <Info label="Original price" value={formatCurrency(Number(originalItem.selling_price))} />
              <Info label="Original discount" value={formatCurrency(Number(originalItem.selling_price) - Number(originalItem.line_total) / originalItem.quantity)} />
              <Info label="Actual paid unit" value={formatCurrency(paidUnitValue)} accent />
              <Info label="Available quantity" value={String(originalItem.remaining_quantity)} />
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Exchange quantity" type="number" min="1" max={originalItem?.remaining_quantity ?? 1} value={returnQuantity} onChange={(event) => setReturnQuantity(Number(event.target.value))} />
              <Select label="Condition" value={condition} onChange={(event) => { const value = event.target.value; setCondition(value); if (value !== 'resellable') setRestock(false); }}>
                <option value="resellable">Resellable</option><option value="damaged">Damaged</option><option value="used">Used</option><option value="defective">Defective</option><option value="other">Other</option>
              </Select>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm">
              <input type="checkbox" checked={restock} disabled={condition !== 'resellable'} onChange={(event) => setRestock(event.target.checked)} />
              Return old item to stock
            </label>
            <div className="rounded-xl bg-emerald-400/10 p-4 text-right"><p className="text-xs uppercase text-emerald-200">Exchange credit</p><p className="mt-1 text-2xl font-bold text-emerald-200">{formatCurrency(exchangeCredit)}</p></div>
          </div>
        </section>

        <section className="glass-card min-w-0 p-5">
          <div className="relative z-10 space-y-4">
            <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Replacement</p><h2 className="mt-1 text-lg font-semibold">Search exact variant</h2></div>
            <div className="flex min-w-0 gap-2"><Input placeholder="Scan barcode, article, or product name" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void findReplacement(); }} /><Button disabled={searching} onClick={() => void findReplacement()}><Search size={16}/>{searching ? 'Searching…' : 'Search'}</Button></div>
            {results.length > 0 && <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-white/10 p-2">{results.map((variant) => <button type="button" key={variant.id} onClick={() => selectReplacement(variant)} className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left hover:bg-white/[.06]"><span className="min-w-0"><strong className="block truncate">{variant.product?.name || 'Product'}</strong><span className="text-xs text-dashboard-text-sub">{variant.product?.item_article || '-'} · {variant.size}/{variant.color} · {variant.barcode_number || 'No barcode'}</span></span><span className="shrink-0 text-right text-xs"><strong className="block">{formatCurrency(Number(variant.selling_price))}</strong>Stock {variant.stock_quantity}</span></button>)}</div>}
            {replacement && <div className="grid gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[.04] p-4 sm:grid-cols-2">
              <Info label="Product" value={replacement.product?.name || 'Product'} /><Info label="Article" value={replacement.product?.item_article || '-'} /><Info label="Variant" value={`${replacement.size} / ${replacement.color}`} /><Info label="Stock" value={String(replacement.stock_quantity)} /><Info label="Barcode" value={replacement.barcode_number || '-'} /><Info label="Selling price" value={formatCurrency(Number(replacement.selling_price))} />
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Replacement quantity" type="number" min="1" max={replacement?.stock_quantity ?? 1} disabled={!replacement} value={replacementQuantity} onChange={(event) => setReplacementQuantity(Number(event.target.value))} />
              <Input label="Discount Price" type="number" min="0" max={replacement?.selling_price ?? 0} step="0.01" disabled={!replacement} value={discountPrice} error={discountError || undefined} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDiscountPrice(Number(event.target.value))} />
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2"><Info label="Discount amount" value={formatCurrency(replacementPricing.lineDiscount)} /><Info label="Replacement value" value={formatCurrency(replacementPricing.lineTotal)} accent /></div>
          </div>
        </section>
      </div>

      <section className="glass-card p-5">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Exchange details</p><Select label="Reason" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Select a reason</option><option value="Size issue">Size issue</option><option value="Colour issue">Colour issue</option><option value="Customer not satisfied">Customer not satisfied</option><option value="Defective item">Defective item</option></Select><Textarea label="Internal notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          <div className="rounded-2xl border border-white/10 bg-black/10 p-5"><h2 className="text-lg font-semibold">Exchange Summary</h2><div className="mt-4 space-y-2 text-sm"><SummaryRow label="Returned item value" value={exchangeCredit}/><SummaryRow label="Replacement item value" value={replacementPricing.lineTotal}/></div><div className="mt-4 border-t border-white/15 pt-4"><p className={`text-xs font-semibold uppercase tracking-wider ${exchangeResult.differenceType === 'customer_refund' ? 'text-amber-300' : exchangeResult.differenceType === 'customer_pays' ? 'text-sky-300' : 'text-emerald-300'}`}>{exchangeResult.differenceType === 'customer_refund' ? 'Refund to customer' : exchangeResult.differenceType === 'customer_pays' ? 'Customer to pay' : 'Even exchange'}</p><p className="mt-1 text-3xl font-bold">{formatCurrency(exchangeResult.differenceAmount)}</p></div></div>
        </div>
      </section>

      {exchangeResult.differenceType !== 'even' && <section className="glass-card p-5"><div className="relative z-10"><h2 className="font-semibold">{exchangeResult.differenceType === 'customer_pays' ? 'Additional payment' : 'Customer refund'}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Select label={exchangeResult.differenceType === 'customer_pays' ? 'Payment method' : 'Refund method'} value={settlementMethod} onChange={(event) => setSettlementMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option>{exchangeResult.differenceType === 'customer_pays' ? <option value="credit" disabled={!sale.customer_id}>Credit</option> : <option value="original_payment_method">Original payment method</option>}</Select><Input label="Amount due" value={formatCurrency(exchangeResult.differenceAmount)} readOnly />{exchangeResult.differenceType === 'customer_pays' && settlementMethod === 'cash' && <><Input label="Amount received" type="number" min={exchangeResult.differenceAmount} step="0.01" value={amountReceived} onChange={(event) => setAmountReceived(Number(event.target.value))}/><Input label="Change" value={formatCurrency(changeDue)} readOnly /></>}{(settlementMethod === 'card' || settlementMethod === 'bank_transfer') && <Input label="Reference" value={reference} onChange={(event) => setReference(event.target.value)} />}</div></div></section>}

      <div className="sticky bottom-3 z-20 flex justify-end"><Button className="min-h-12 min-w-52 shadow-xl" disabled={saving || !replacement || Boolean(discountError)} onClick={() => void submit()}><CheckCircle2 size={18}/>{saving ? 'Processing exchange…' : 'Confirm Exchange'}</Button></div>
    </div>
  );
}

function Info({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div><p className="text-[11px] uppercase text-dashboard-text-label">{label}</p><p className={`mt-1 font-semibold ${accent ? 'text-emerald-300' : 'text-dashboard-text-primary'}`}>{value}</p></div>; }
function SummaryRow({ label, value }: { label: string; value: number }) { return <div className="flex justify-between gap-4"><span className="text-dashboard-text-sub">{label}</span><strong>{formatCurrency(value)}</strong></div>; }
