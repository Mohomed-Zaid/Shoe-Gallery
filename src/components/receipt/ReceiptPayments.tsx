import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/format';
import type { ReceiptPayment } from './types';

const title = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());

function PaymentRow({ label, value, method = false }: { label: string; value: string; method?: boolean }) {
  return (
    <div className={`receipt-payment-row${method ? ' receipt-payment-row--method' : ''}`}>
      <span>{label}</span>
      <span className="receipt-payment-value">{value}</span>
    </div>
  );
}

export function ReceiptPayments({ sale, payments }: { sale: Sale; payments: ReceiptPayment[] }) {
  const isCardPayment = payments.length <= 1 && (payments[0]?.payment_method || sale.payment_method) === 'card';
  const paid = payments.length > 1
    ? payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    : Number(sale.amount_tendered ?? sale.paid_amount ?? 0);
  const change = Number(sale.change_due ?? 0);
  const outstanding = Number(sale.balance_due ?? 0);

  return (
    <section className="receipt-section receipt-payments">
      {payments.length > 1
        ? payments.map((payment, index) => (
          <PaymentRow
            key={payment.id || `${payment.payment_method}-${index}`}
            label={title(payment.payment_method)}
            value={formatCurrency(Number(payment.amount))}
          />
        ))
        : (
          <PaymentRow
            label="Payment Method"
            value={title(payments[0]?.payment_method || sale.payment_method)}
            method
          />
        )}
      {!isCardPayment && <PaymentRow label="Paid" value={formatCurrency(paid)} />}
      {change > 0 && <PaymentRow label="Change" value={formatCurrency(change)} />}
      {outstanding > 0 && <PaymentRow label="Outstanding" value={formatCurrency(outstanding)} />}
    </section>
  );
}
