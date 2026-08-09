import type { CSSProperties } from 'react';
import { ReceiptFooter } from './ReceiptFooter';
import { ReceiptHeader } from './ReceiptHeader';
import { ReceiptItems } from './ReceiptItems';
import { ReceiptPayments } from './ReceiptPayments';
import { ReceiptTotals } from './ReceiptTotals';
import type { ReceiptProps } from './types';
import { getReceiptPrintStyle } from '../../services/receiptPrintStyle';

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(maximum, Math.max(minimum, numericValue))
    : fallback;
}

function printableWidth(paperWidth: 58 | 80, value: number | undefined) {
  const numericValue = Number(value);
  const fallback = paperWidth === 58 ? 52 : 72;
  const maximum = paperWidth === 58 ? 54 : 76;
  return Number.isFinite(numericValue) && numericValue >= 48 && numericValue <= maximum
    ? numericValue
    : fallback;
}

export function ThermalReceipt({ sale, items, payments, customer, store }: ReceiptProps) {
  const created = new Date(sale.created_at);
  const paperWidth = store?.receipt_paper_width_mm === 58 ? 58 : 80;
  const storedLeftPadding = Number(store?.receipt_left_padding_mm);
  const storedRightPadding = Number(store?.receipt_right_padding_mm);
  const usesLegacyPadding = storedLeftPadding === 4 && storedRightPadding === 4;
  const style = {
    '--receipt-printable-width': `${printableWidth(paperWidth, store?.receipt_printable_width_mm)}mm`,
    '--receipt-left-padding': `${usesLegacyPadding ? 2 : boundedNumber(store?.receipt_left_padding_mm, 2, 0, 10)}mm`,
    '--receipt-right-padding': `${usesLegacyPadding ? 3 : boundedNumber(store?.receipt_right_padding_mm, 3, 0, 10)}mm`,
    '--receipt-top-padding': `${boundedNumber(store?.receipt_top_padding_mm, 2, 0, 10)}mm`,
    '--receipt-bottom-padding': `${boundedNumber(store?.receipt_bottom_padding_mm, 1, 0, 3)}mm`,
    '--receipt-font-size': `${boundedNumber(store?.receipt_font_size_px, 11, 11, 14)}px`,
    '--receipt-horizontal-offset': `${boundedNumber(store?.receipt_horizontal_offset_mm, 0, -5, 5)}mm`,
  } as CSSProperties;

  return (
    <div
      className={`thermal-receipt thermal-receipt--${paperWidth} receipt-print-style-${getReceiptPrintStyle()}`}
      style={style}
      role="document"
    >
      <ReceiptHeader store={store} />
      <div className="receipt-divider" aria-hidden="true" />

      <section className="receipt-section receipt-info">
        <div className="receipt-info-row">
          <span className="receipt-info-label">Invoice:</span>
          <span className="receipt-info-value">{sale.invoice_number || sale.id.slice(0, 8)}</span>
        </div>
        <div className="receipt-info-row">
          <span className="receipt-info-label">Date:</span>
          <span className="receipt-info-value">{created.toLocaleDateString()}</span>
        </div>
        <div className="receipt-info-row">
          <span className="receipt-info-label">Time:</span>
          <span className="receipt-info-value">
            {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="receipt-info-row">
          <span className="receipt-info-label">Cashier:</span>
          <span className="receipt-info-value">
            {'cashier' in sale
              ? sale.cashier?.full_name || sale.cashier?.email || 'Cashier'
              : 'Cashier'}
          </span>
        </div>
        {customer && store?.receipt_show_customer !== false && (
          <div className="receipt-info-row">
            <span className="receipt-info-label">Customer:</span>
            <span className="receipt-info-value">{customer.name}</span>
          </div>
        )}
      </section>

      <div className="receipt-divider" aria-hidden="true" />
      <ReceiptItems items={items} />
      <div className="receipt-divider" aria-hidden="true" />
      <ReceiptTotals sale={sale} />
      <div className="receipt-divider" aria-hidden="true" />
      <ReceiptPayments sale={sale} payments={payments} />
      <div className="receipt-divider" aria-hidden="true" />
      <ReceiptFooter store={store} />
    </div>
  );
}
