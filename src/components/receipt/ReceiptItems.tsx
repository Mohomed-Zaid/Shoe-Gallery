import type { SaleItem } from '../../types';
import type { SaleWithRelations } from '../../services/salesService';
import { formatCurrency } from '../../utils/format';

type Item = SaleWithRelations['sale_items'][number] | SaleItem;

export function ReceiptItems({items}:{items:Item[]}) {
  return <section className="receipt-section receipt-items">{items.map(item=>{const related=item as SaleWithRelations['sale_items'][number];const name=item.product_name_snapshot||related.variant?.product?.name||item.product_name||'Unknown item';const size=item.size_snapshot||related.variant?.size||'—';const colour=item.color_snapshot||related.variant?.color||'—';return <article className="receipt-item" key={item.id}><strong className="receipt-item-name">{name}</strong><div className="receipt-muted">{size} / {colour}</div><div className="receipt-row"><span>{item.quantity} x {formatCurrency(Number(item.selling_price))}</span><span>{formatCurrency(Number(item.line_total))}</span></div>{Number(item.discount_amount)>0&&<div className="receipt-row receipt-muted"><span>Item discount</span><span>-{formatCurrency(Number(item.discount_amount))}</span></div>}</article>})}</section>;
}
