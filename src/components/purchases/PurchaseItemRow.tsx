import { Trash2 } from 'lucide-react';
import { Input } from '../ui';
import type { PurchaseItemInput } from '../../types/purchase';
import type { Product, ProductVariant } from '../../types';
import { formatCurrency } from '../../utils/format';

type Variant = ProductVariant & { product: Product };
export function PurchaseItemRow({ item, variant, onChange, onRemove }: {
  item: PurchaseItemInput; variant: Variant; onChange: (item: PurchaseItemInput) => void; onRemove: () => void;
}) {
  const lineTotal = Math.max(0, item.quantity * item.cost_price - item.line_discount);
  return <tr className="border-t border-white/10">
    <td className="min-w-48 px-3 py-3"><p className="font-medium text-dashboard-text-primary">{variant.product.name}</p><p className="text-xs text-dashboard-text-sub">Article Number: {variant.product.item_article || variant.product.item_number || variant.product.code}</p><p className="text-xs text-dashboard-text-sub">{variant.barcode_number || 'No barcode'}</p></td>
    <td className="px-3 py-3 text-sm text-dashboard-text-sub">{variant.size}</td>
    <td className="px-3 py-3 text-sm text-dashboard-text-sub">{variant.color}</td>
    <td className="px-3 py-3 text-sm text-dashboard-text-sub">{variant.stock_quantity}</td>
    <td className="min-w-24 px-3 py-3"><Input aria-label="Quantity" type="number" min="1" value={item.quantity} onChange={(e)=>onChange({...item,quantity:Number(e.target.value)})}/></td>
    <td className="min-w-28 px-3 py-3"><Input aria-label="Cost price" type="number" min="0" step="0.01" value={item.cost_price} onChange={(e)=>onChange({...item,cost_price:Number(e.target.value)})}/></td>
    <td className="min-w-28 px-3 py-3"><Input aria-label="Selling price" type="number" min="0" step="0.01" value={item.selling_price ?? ''} onChange={(e)=>onChange({...item,selling_price:e.target.value===''?null:Number(e.target.value)})}/></td>
    <td className="min-w-28 px-3 py-3"><Input aria-label="Line discount" type="number" min="0" step="0.01" value={item.line_discount} onChange={(e)=>onChange({...item,line_discount:Number(e.target.value)})}/></td>
    <td className="whitespace-nowrap px-3 py-3 font-semibold text-dashboard-text-primary">{formatCurrency(lineTotal)}</td>
    <td className="px-3 py-3"><label className="flex min-w-28 items-center gap-2 text-xs text-dashboard-text-label"><input type="checkbox" checked={item.update_selling_price} onChange={(e)=>onChange({...item,update_selling_price:e.target.checked})}/> Update selling price</label></td>
    <td className="px-3 py-3"><button type="button" aria-label="Remove item" onClick={onRemove} className="text-red-400 hover:text-red-300"><Trash2 size={18}/></button></td>
  </tr>;
}
