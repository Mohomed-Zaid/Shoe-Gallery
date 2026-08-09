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
  return (
    <section className="receipt-section receipt-totals">
      <TotalRow label="Subtotal" value={formatCurrency(Number(sale.subtotal))} />
      {Number(sale.discount_amount) > 0 && (
        <TotalRow label="Discount" value={`-${formatCurrency(Number(sale.discount_amount))}`} />
      )}
      {Number(sale.tax_amount) !== 0 && (
        <TotalRow label="Tax" value={formatCurrency(Number(sale.tax_amount))} />
      )}
      <div className="receipt-grand-total">
        <TotalRow label="TOTAL" value={formatCurrency(Number(sale.total_amount))} />
      </div>
    </section>
  );
}
