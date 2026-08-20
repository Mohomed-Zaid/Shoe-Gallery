import type { CSSProperties } from 'react';
import type { StoreSettings } from '../../types';
import type { SalesReturnRecord } from '../../types/salesReturn';
import { formatCurrency } from '../../utils/format';
import { ReceiptFooter } from './ReceiptFooter';
import { ReceiptHeader } from './ReceiptHeader';

export function ReturnReceipt({ record, store }: { record: SalesReturnRecord; store: StoreSettings | null }) {
  const item = record.sales_return_items[0];
  const style = {
    '--receipt-printable-width': String(store?.receipt_printable_width_mm ?? 72) + 'mm',
    '--receipt-left-padding': String(store?.receipt_left_padding_mm ?? 2) + 'mm',
    '--receipt-right-padding': String(store?.receipt_right_padding_mm ?? 3) + 'mm',
    '--receipt-top-padding': String(store?.receipt_top_padding_mm ?? 2) + 'mm',
    '--receipt-bottom-padding': String(store?.receipt_bottom_padding_mm ?? 1) + 'mm',
    '--receipt-font-size': String(store?.receipt_font_size_px ?? 11) + 'px',
    '--receipt-horizontal-offset': String(store?.receipt_horizontal_offset_mm ?? 0) + 'mm',
  } as CSSProperties;
  return <div className={'thermal-receipt thermal-receipt--' + (store?.receipt_paper_width_mm === 58 ? 58 : 80)} style={style} role="document">
    <ReceiptHeader store={store}/><div className="receipt-divider"/>
    <section className="receipt-section receipt-info">
      <h2 className="text-center text-base font-bold">RETURN</h2>
      <div className="receipt-info-row"><span>Return:</span><strong>{record.return_number}</strong></div>
      <div className="receipt-info-row"><span>Original Invoice:</span><strong>{record.sale?.invoice_number || '—'}</strong></div>
      <div className="receipt-info-row"><span>Date:</span><span>{new Date(record.return_date).toLocaleString()}</span></div>
    </section><div className="receipt-divider"/>
    <section className="receipt-section">
      <strong>{item?.product_name}</strong>
      <p>{[item?.size, item?.colour].filter(Boolean).join(' / ')}</p>
      <div className="receipt-info-row"><span>Qty Returned</span><strong>{item?.quantity_returned ?? 0}</strong></div>
      <div className="receipt-info-row"><span>Return Value</span><strong>{formatCurrency(Number(item?.return_total ?? 0))}</strong></div>
      <div className="receipt-info-row"><span>Restocked</span><strong>{item?.restock_item ? 'Yes' : 'No'}</strong></div>
      <div className="receipt-info-row"><span>Refund Method</span><span>{record.refund_method?.replaceAll('_', ' ') || 'No refund'}</span></div>
    </section><div className="receipt-divider"/><ReceiptFooter store={store}/>
  </div>;
}