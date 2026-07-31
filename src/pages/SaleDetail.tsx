import { useCallback, useEffect, useState, useRef } from 'react';
import { ArrowLeft, Printer, RotateCcw } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { SaleWithRelations } from '../services/salesService';
import * as salesService from '../services/salesService';
import * as settingsService from '../services/settingsService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import { Alert, Button, Input, LoadingSpinner, Modal, PageHeader, Select } from '../components/ui';
import type { StoreSettings } from '../types';

interface ReturnFormValues {
  variant_id: string;
  quantity: number;
  reason: string;
  return_type: 'refund' | 'exchange_size' | 'exchange_color' | 'exchange_product' | 'store_credit';
  refund_amount: number;
}

export function SaleDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [sale, setSale] = useState<SaleWithRelations | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ReturnFormValues>();

  const fetchSale = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [saleResult, settingsResult] = await Promise.all([
      salesService.getSaleById(id),
      settingsService.getStoreSettings(),
    ]);

    if (saleResult.error) {
      setError(getErrorMessage(saleResult.error));
    } else {
      setSale((saleResult.data as SaleWithRelations | null) ?? null);
    }

    if (!settingsResult.error) {
      setSettings((settingsResult.data as StoreSettings | null) ?? null);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchSale();
  }, [fetchSale]);

  const printTriggered = useRef(false);

  useEffect(() => {
    if (!loading && location.search.includes('print=1') && sale && !printTriggered.current) {
      printTriggered.current = true;
      window.setTimeout(() => window.print(), 250);
    }
  }, [loading, location.search, sale]);

  const onReturnSubmit = async (values: ReturnFormValues) => {
    if (!sale) return;
    try {
      await salesService.createReturn({
        sale_id: sale.id,
        customer_id: sale.customer_id,
        return_type: values.return_type,
        refund_amount: Number(values.refund_amount),
        store_credit_amount: values.return_type === 'store_credit' ? Number(values.refund_amount) : 0,
        items: [
          {
            variant_id: values.variant_id,
            quantity: Number(values.quantity),
            reason: values.reason,
          },
        ],
      });
      setShowReturnModal(false);
      reset();
      fetchSale();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const invoiceTitle = settings?.store_name || 'Shoe Gallery';
  const receiptFooter = settings?.receipt_footer || 'Thank you for shopping with us.';
  const customerName = sale?.customer?.name || 'Walk-in Customer';
  const cashierName = sale?.cashier?.full_name || sale?.cashier?.email || 'Cashier';
  const changeDue = Math.max(Number(sale?.paid_amount ?? 0) - Number(sale?.total_amount ?? 0), 0);

  if (loading) return <LoadingSpinner />;
  if (!sale) return <Alert message={error ?? 'Sale not found.'} />;

  return (
    <div className="sale-invoice-page space-y-6 print:space-y-0">
      <div className="print-hidden">
        <PageHeader
          title={sale.invoice_number || `Sale ${sale.id.slice(0, 8)}`}
          description="Invoice details and printable receipt"
          action={
            <div className="flex flex-wrap gap-2">
              <Link to="/sales">
                <Button variant="secondary">
                  <ArrowLeft size={16} />
                  Back
                </Button>
              </Link>
              <Button variant="secondary" onClick={() => setShowReturnModal(true)}>
                <RotateCcw size={16} />
                Return / Exchange
              </Button>
              <Button onClick={() => window.print()}>
                <Printer size={16} />
                Print
              </Button>
            </div>
          }
        />
      </div>

      {error && (
        <div className="print-hidden">
          <Alert message={error} />
        </div>
      )}

      <div className="invoice-print-area rounded-2xl border border-slate-300 bg-white p-6 text-black shadow-sm print:border-none print:bg-white print:text-black print:shadow-none">
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-6 border-b border-slate-300 pb-6 print:hidden md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-black print:text-black">{invoiceTitle}</h2>
              <p className="mt-1 text-sm text-slate-600 print:text-slate-600">{settings?.address || 'Store address not configured'}</p>
              <p className="text-sm text-slate-600 print:text-slate-600">{settings?.phone || '-'} • {settings?.email || '-'}</p>
            </div>
            <div className="text-sm">
              <p className="font-semibold text-black print:text-black">Invoice: {sale.invoice_number || sale.id.slice(0, 8)}</p>
              <p className="mt-1 text-slate-600 print:text-slate-600">Date: {formatDate(sale.created_at)}</p>
              <p className="text-slate-600 print:text-slate-600">Payment: {sale.payment_method.replace('_', ' ')}</p>
              <p className="text-slate-600 print:text-slate-600">Status: {sale.status}</p>
            </div>
          </div>

          <div className="hidden border-b border-dashed border-slate-300 pb-4 text-center print:block">
            <h2 className="text-xl font-bold text-black">{invoiceTitle}</h2>
            <p className="mt-1 text-xs text-slate-600">{settings?.address || 'Store address not configured'}</p>
            <p className="text-xs text-slate-600">{settings?.phone || '-'}</p>
            <p className="text-xs text-slate-600">{settings?.email || '-'}</p>
          </div>

          <div className="hidden space-y-1 border-b border-dashed border-slate-300 pb-4 text-xs text-slate-700 print:block">
            <div className="flex items-center justify-between">
              <span>Invoice</span>
              <span>{sale.invoice_number || sale.id.slice(0, 8)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Date</span>
              <span>{formatDateTime(sale.created_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Customer</span>
              <span>{customerName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Payment</span>
              <span>{sale.payment_method.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="capitalize">{sale.status}</span>
            </div>
          </div>

          <div className="grid gap-4 print:hidden md:grid-cols-2">
            <div className="rounded-2xl border border-slate-300 bg-white p-4 print:border-slate-300 print:bg-transparent">
              <h3 className="font-semibold text-black print:text-black">Customer Information</h3>
              <p className="mt-3 text-sm text-slate-600 print:text-slate-600">{customerName}</p>
              <p className="text-sm text-slate-600 print:text-slate-600">{sale.customer?.phone || '-'}</p>
              <p className="text-sm text-slate-600 print:text-slate-600">{sale.customer?.email || '-'}</p>
              <p className="text-sm text-slate-600 print:text-slate-600">{sale.customer?.address || '-'}</p>
            </div>
            <div className="rounded-2xl border border-slate-300 bg-white p-4 print:border-slate-300 print:bg-transparent">
              <h3 className="font-semibold text-black print:text-black">Sale Summary</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600 print:text-slate-600"><span>Subtotal</span><span>{formatCurrency(Number(sale.subtotal))}</span></div>
                <div className="flex justify-between text-slate-600 print:text-slate-600"><span>Discount</span><span>{formatCurrency(Number(sale.discount_amount))}</span></div>
                <div className="flex justify-between text-slate-600 print:text-slate-600"><span>Tax</span><span>{formatCurrency(Number(sale.tax_amount))}</span></div>
                <div className="flex justify-between font-semibold text-black print:text-black"><span>Grand Total</span><span>{formatCurrency(Number(sale.total_amount))}</span></div>
              <div className="flex justify-between text-slate-600 print:text-slate-600"><span>Paid</span><span>{formatCurrency(Number(sale.paid_amount))}</span></div>
              <div className="flex justify-between text-slate-600 print:text-slate-600"><span>Change Due</span><span>{formatCurrency(changeDue)}</span></div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-300 print:hidden print:border-slate-300">
            <table className="w-full">
              <thead className="border-b border-slate-300 bg-slate-100 print:border-slate-300 print:bg-slate-100">
                <tr>
                  {['Item', 'Size', 'Color', 'Qty', 'Price', 'Discount', 'Total'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-600 print:text-slate-600">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sale.sale_items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200 last:border-none print:border-slate-200">
                    <td className="px-4 py-3 text-sm text-black print:text-black">{item.product_name_snapshot || item.variant?.product?.name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 print:text-slate-600">{item.size_snapshot || item.variant?.size || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 print:text-slate-600">{item.color_snapshot || item.variant?.color || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 print:text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 print:text-slate-600">{formatCurrency(Number(item.selling_price))}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 print:text-slate-600">{formatCurrency(Number(item.discount_amount))}</td>
                    <td className="px-4 py-3 text-sm font-medium text-black print:text-black">{formatCurrency(Number(item.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hidden space-y-3 text-xs print:block">
            <div className="border-b border-dashed border-slate-300 pb-2">
              {sale.sale_items.map((item) => (
                <div key={item.id} className="py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-black">{item.product_name_snapshot || item.variant?.product?.name || 'Unknown'}</p>
                      <p className="text-slate-600">
                        {item.size_snapshot || item.variant?.size || '-'} / {item.color_snapshot || item.variant?.color || '-'}
                      </p>
                    </div>
                    <p className="whitespace-nowrap font-medium text-black">{formatCurrency(Number(item.line_total))}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-slate-600">
                    <span>
                      {item.quantity} x {formatCurrency(Number(item.selling_price))}
                    </span>
                    {Number(item.discount_amount) > 0 ? (
                      <span>Disc {formatCurrency(Number(item.discount_amount))}</span>
                    ) : (
                      <span />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-b border-dashed border-slate-300 pb-3 text-slate-700">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(Number(sale.subtotal))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Discount</span>
                <span>{formatCurrency(Number(sale.discount_amount))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tax</span>
                <span>{formatCurrency(Number(sale.tax_amount))}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold text-black">
                <span>Total</span>
                <span>{formatCurrency(Number(sale.total_amount))}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>Paid</span>
                <span>{formatCurrency(Number(sale.paid_amount))}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span>Change</span>
                <span>{formatCurrency(changeDue)}</span>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-600 print:text-slate-600">{receiptFooter}</p>
        </div>
      </div>

      {showReturnModal && (
        <Modal title="Create Return / Exchange" onClose={() => setShowReturnModal(false)}>
          <form onSubmit={handleSubmit(onReturnSubmit)} className="space-y-4">
            <Select label="Item" error={errors.variant_id?.message} {...register('variant_id', { required: 'Item is required' })}>
              <option value="">Select an item</option>
              {sale.sale_items.map((item) => (
                <option key={item.id} value={item.variant_id || ''} disabled={!item.variant_id}>
                  {(item.product_name_snapshot || item.variant?.product?.name || 'Unknown')} - {item.size_snapshot || item.variant?.size || '-'} / {item.color_snapshot || item.variant?.color || '-'} {!item.variant_id && '(Non-returnable)'}
                </option>
              ))}
            </Select>
            <Input type="number" label="Quantity" error={errors.quantity?.message} {...register('quantity', { required: 'Quantity is required', min: 1 })} />
            <Select label="Return Type" error={errors.return_type?.message} {...register('return_type', { required: 'Return type is required' })}>
              <option value="refund">Refund</option>
              <option value="exchange_size">Exchange Size</option>
              <option value="exchange_color">Exchange Color</option>
              <option value="exchange_product">Exchange Product</option>
              <option value="store_credit">Store Credit</option>
            </Select>
            <Input type="number" label="Refund / Credit Amount" error={errors.refund_amount?.message} {...register('refund_amount', { required: 'Amount is required', min: 0 })} />
            <Input label="Reason" error={errors.reason?.message} {...register('reason', { required: 'Reason is required' })} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowReturnModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Return'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
