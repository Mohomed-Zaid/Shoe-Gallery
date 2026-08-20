import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/format';

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-total-row">
      <span>{label}</span>
      <span className="receipt-total-amount">{value}</span>
    </div>
  );
}

export function ReceiptTotals({ sale }: { sale: Sale }) {
  const invoiceTotal = Math.max(Number(sale.total_amount) - Number(sale.card_payment_fee ?? 0), 0);
  const saleDiscount = Number(sale.invoice_discount_amount ?? 0);
  const itemDiscount = Math.max(Number(sale.discount_amount) - saleDiscount, 0);

  return (
    <section className="receipt-section receipt-totals">
      <TotalRow label="Subtotal" value={formatCurrency(Number(sale.subtotal))} />
      {itemDiscount > 0 && (
        <TotalRow label="Item Discount" value={`-${formatCurrency(itemDiscount)}`} />
      )}
      {saleDiscount > 0 && (
        <TotalRow label="Sale Discount" value={`-${formatCurrency(saleDiscount)}`} />
      )}
      {Number(sale.tax_amount) !== 0 && (
        <TotalRow label="Tax" value={formatCurrency(Number(sale.tax_amount))} />
      )}
      <div className="receipt-grand-total">
        <TotalRow label="TOTAL" value={formatCurrency(invoiceTotal)} />
      </div>
    </section>
  );
}
