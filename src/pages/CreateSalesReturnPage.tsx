import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, LoadingSpinner, PageHeader, Select, Textarea } from '../components/ui';
import { SaleLookupForReturn } from '../components/returns/SaleLookupForReturn';
import { ReturnableSaleItemsTable, type SelectedReturnItem } from '../components/returns/ReturnableSaleItemsTable';
import { RefundSection } from '../components/returns/RefundSection';
import { ProductExchangeForm } from '../components/returns/ProductExchangeForm';
import { completeSalesReturn, searchReturnableSales } from '../services/salesReturnService';
import type { ReturnableSale, SalesReturnType } from '../types/salesReturn';
import { calculateHistoricalPaidUnitValue } from '../utils/exchangeCalculation';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

export function CreateSalesReturnPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('invoice') ?? '');
  const [sales, setSales] = useState<ReturnableSale[]>([]);
  const [sale, setSale] = useState<ReturnableSale>();
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<SelectedReturnItem[]>([]);
  const [type, setType] = useState<SalesReturnType>('refund');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [refund, setRefund] = useState({ refund_method: 'cash', refund_amount: 0, store_credit_amount: 0, refund_reference: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const find = async (search = query) => {
    setSearching(true);
    setError(undefined);
    try {
      const matches = await searchReturnableSales(search);
      setSales(matches);
      if (search && matches.length === 1) {
        setSale(matches[0]);
        setItems([]);
      }
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const invoice = params.get('invoice');
    if (invoice) void find(invoice);
    // The invoice query is only used to initialize this workflow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returnValue = useMemo(() => items.reduce((sum, selected) => {
    const item = sale?.sale_items.find((candidate) => candidate.id === selected.sale_item_id);
    return sum + (item ? calculateHistoricalPaidUnitValue(sale!, item) * selected.quantity : 0);
  }, 0), [items, sale]);

  const submitReturn = async () => {
    if (!sale || !reason.trim() || !items.length) {
      setError('Select a sale, returned items, and enter a reason.');
      return;
    }
    for (const selected of items) {
      const item = sale.sale_items.find((candidate) => candidate.id === selected.sale_item_id);
      if (!item || selected.quantity < 1 || selected.quantity > item.remaining_quantity) {
        setError('A return quantity exceeds the available quantity.');
        return;
      }
    }
    setSaving(true);
    setError(undefined);
    try {
      const id = await completeSalesReturn({ sale_id: sale.id, return_type: type, reason, notes, ...refund, items });
      navigate(`/returns/${id}`);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6">
    <PageHeader title="New Sales Return / Exchange" description="Process a return or exchange against the original invoice." action={<Link to="/returns"><Button variant="secondary"><ArrowLeft size={16}/>Back</Button></Link>} />
    {error && <Alert message={error} />}
    <SaleLookupForReturn value={query} onChange={setQuery} onSearch={() => void find()} loading={searching} />
    {searching ? <LoadingSpinner /> : !sale && sales.length > 0 && <section className="glass-card p-5"><div className="relative z-10"><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Search results</p><div className="mt-3 grid gap-3">{sales.map((result) => <button key={result.id} onClick={() => { setSale(result); setItems([]); }} className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 p-4 text-left hover:border-sky-400/40 sm:flex-row"><div><p className="font-semibold text-dashboard-text-primary">{result.invoice_number}</p><p className="text-sm text-dashboard-text-sub">{result.customer?.name || 'Walk-in Customer'} · {formatDateTime(result.created_at)}</p></div><div className="sm:text-right"><p className="font-semibold">{formatCurrency(Number(result.total_amount))}</p><p className="text-xs text-emerald-300">{result.sale_items.reduce((count, item) => count + item.remaining_quantity, 0)} item(s) available</p></div></button>)}</div></div></section>}
    {sale && <>
      <section className="glass-card p-5"><div className="relative z-10"><div className="grid gap-4 md:grid-cols-4"><Info label="Invoice" value={sale.invoice_number}/><Info label="Customer" value={sale.customer?.name || 'Walk-in Customer'}/><Info label="Sale date" value={formatDateTime(sale.created_at)}/><Info label="Total / Paid" value={`${formatCurrency(Number(sale.total_amount))} / ${formatCurrency(Number(sale.paid_amount))}`}/></div><button className="mt-4 text-xs text-sky-300" onClick={() => { setSale(undefined); setItems([]); }}>Choose a different sale</button></div></section>
      <section className="glass-card p-5"><div className="relative z-10"><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Workflow</p><div className="mt-3 max-w-md"><Select label="Return or exchange" value={type} onChange={(event) => { setType(event.target.value as SalesReturnType); setItems([]); }}><option value="refund">Return · Refund</option><option value="product_exchange">Exchange · Product</option><option value="store_credit">Return · Store credit</option><option value="no_refund">Return · No refund</option><option value="damaged_return">Return · Damaged item</option></Select></div></div></section>
      {type === 'product_exchange' ? (
        <ProductExchangeForm sale={sale} onCompleted={(id) => navigate(`/returns/${id}`)} />
      ) : <>
        <ReturnableSaleItemsTable sale={sale} selected={items} onChange={setItems} />
        <section className="glass-card p-5"><div className="relative z-10"><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Return details</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Select label="Reason" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Select a reason</option><option value="Size issue">Size issue</option><option value="Colour issue">Colour issue</option><option value="Customer not satisfied">Customer not satisfied</option></Select><div className="md:col-span-2"><Textarea label="Internal notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div></div></section>
        <RefundSection returnValue={returnValue} customerId={sale.customer_id} value={refund} onChange={setRefund} />
        <div className="flex justify-end"><Button disabled={saving || !items.length} onClick={() => void submitReturn()}><CheckCircle2 size={17}/>{saving ? 'Completing return…' : `Complete Return · ${formatCurrency(returnValue)}`}</Button></div>
      </>}
    </>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white/[.04] p-3"><p className="text-xs uppercase text-dashboard-text-label">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
